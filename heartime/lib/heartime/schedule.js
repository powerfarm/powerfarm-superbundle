// O coracao. Logica pura, sem dependencias, sem relogio proprio: o tempo entra
// como argumento para que os testes possam mentir sobre ele.
//
// Tres regras que este ficheiro existe para nao deixar quebrar:
//
//   1  a taxa e derivada, nunca configurada    proximoBatimento = min(prazos)
//   2  o prazo escreve-se na EMISSAO           quem dorme nunca responde,
//                                              logo nunca agendaria a si proprio
//   3  a varredura e level-triggered           pergunta "o que nao esta como
//                                              declarado", nao "o que venceu"
//
// A observabilidade define o ritmo: o eco que volta e que decide quando se
// volta a olhar. UNKNOWN aperta, HEALTHY relaxa. Isto nao e optimizacao --
// e a razao pela qual o sistema amostra mais depressa exactamente quando
// sabe menos.

/** Estados do contrato de saude. UNKNOWN nunca e saudavel. */
export const SAUDE = Object.freeze({
  HEALTHY: 'HEALTHY',
  UNHEALTHY: 'UNHEALTHY',
  UNKNOWN: 'UNKNOWN',
});

/** Os dois ramos. Mesmo cadastro, mesmo livro, modos diferentes. */
export const RAMO = Object.freeze({
  PARA: 'parasympathetic', // agendado. o padrao.
  SYM: 'sympathetic',      // o mundo bateu a porta. adrenalina.
});

export const PADRAO = Object.freeze({
  /** A janela do health-contract. Evidencia mais velha que isto nao conta. */
  frescuraMin: 15,
  /** Tolerancia antes de provocar um despertar caro. */
  toleranciaMin: 2,
  /** UNKNOWN e o estado que o coracao existe para eliminar. */
  apertoUnknownMin: 1,
  /** UNHEALTHY tem para onde escalar; nao precisa do mesmo aperto. */
  apertoUnhealthyMin: 5,
  /** Adrenalina nao pode durar para sempre: um corpo simpatico permanente esgota. */
  decaimentoAdrenalinaMin: 60,
  /** Sob adrenalina, manutencao adia-se. Nao se acumula: empurra-se. */
  adiamentoSobAdrenalinaMin: 30,
});

const MIN = 60_000;
const ms = (min) => Math.round(min * MIN);
const t = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/**
 * Quando voltar a olhar para este orgao.
 *
 * Regra 3 do documento: quem responde pode ENCURTAR o proximo prazo. Nunca e
 * a unica coisa que o cria. Por isso esta funcao aceita `eco = null` e
 * continua a devolver um prazo -- o orgao calado tambem e agendado.
 */
export function proximoPrazo(orgao, eco, agora, cfg = PADRAO) {
  const base = t(agora);
  const frescura = orgao.freshness_minutes ?? orgao.cadence_minutes ?? cfg.frescuraMin;

  // Sem eco nao ha informacao nova, mas ha obrigacao. Reagenda-se dentro da janela
  // maxima de frescura declarada -- e e isto que impede o silencio de sair do radar.
  if (!eco) return new Date(base + ms(Math.min(frescura, cfg.frescuraMin)));

  switch (eco.health) {
    case SAUDE.UNKNOWN:
      return new Date(base + ms(cfg.apertoUnknownMin));
    case SAUDE.UNHEALTHY:
      return new Date(base + ms(cfg.apertoUnhealthyMin));
    case SAUDE.HEALTHY:
      // Relaxa ate a janela do contrato, nunca alem dela: passar a janela
      // significa deixar de ter evidencia actual, ou seja, virar UNKNOWN.
      return new Date(base + ms(Math.min(frescura, cfg.frescuraMin)));
    default:
      return new Date(base + ms(cfg.apertoUnknownMin));
  }
}

/**
 * O estado de um orgao registado, lido SEM o acordar.
 *
 * A pergunta barata ("estas ai?") responde-se do registo duravel. A cara
 * ("estas bem?") obriga a executar. Separa-las e o que permite ter cinquenta
 * offices adormecidos sem que o coracao seja a coisa mais cara do sistema.
 */
export function estadoDe(orgao, agora, cfg = PADRAO) {
  const base = t(agora);
  const visto = orgao.last_seen ? t(orgao.last_seen) : null;
  const esperado = orgao.next_expected ? t(orgao.next_expected) : null;
  const janela = ms(cfg.frescuraMin);

  if (orgao.status === 'absent') {
    return { estado: 'absent', saude: SAUDE.UNHEALTHY, provocar: true };
  }
  // Nunca foi visto: registado nao e o mesmo que presente.
  if (visto === null) {
    return { estado: 'unverified', saude: SAUDE.UNKNOWN, provocar: true };
  }
  // Passou o prazo mais a tolerancia -> deixou de haver evidencia. Provoca.
  if (esperado !== null && base > esperado + ms(cfg.toleranciaMin)) {
    return { estado: 'overdue', saude: SAUDE.UNKNOWN, provocar: true };
  }
  // Evidencia fora da janela de frescura nao conta como actual.
  if (base - visto > janela) {
    return { estado: 'stale', saude: SAUDE.UNKNOWN, provocar: true };
  }
  if (orgao.working) {
    return { estado: 'working', saude: SAUDE.HEALTHY, provocar: false };
  }
  // Idle verificado. Este e o estado correcto da maior parte dos orgaos.
  return { estado: 'idle', saude: SAUDE.HEALTHY, provocar: false };
}

/**
 * A varredura. Level-triggered de proposito.
 *
 * Nao pergunta "o que venceu?" -- pergunta "o que nao esta como declarado?".
 * Um evento perdido e reparado na passagem seguinte sem que ninguem repare que
 * se perdeu. Uma varredura que encontra tudo certo custa quase nada.
 */
export function varrer(orgaos, agora, opcoes = {}) {
  const cfg = { ...PADRAO, ...(opcoes.cfg || {}) };
  const base = t(agora);
  const adrenalina = Boolean(opcoes.adrenalina);
  const emitir = [];
  const observado = [];

  for (const orgao of orgaos) {
    const estado = estadoDe(orgao, agora, cfg);
    observado.push({ organ_id: orgao.id, ...estado });

    // Sob adrenalina a digestao suprime-se: manutencao saudavel espera.
    // O que esta UNKNOWN ou ausente continua a passar -- adrenalina adia
    // manutencao, nunca adia descobrir que um orgao morreu.
    if (adrenalina && !estado.provocar) continue;

    const esperado = orgao.next_expected ? t(orgao.next_expected) : null;
    const vencido = esperado === null || base >= esperado;
    if (vencido || estado.provocar) {
      emitir.push({
        organ_id: orgao.id,
        branch: RAMO.PARA,
        // Caro so sob suspeita: um orgao verificado ha pouco recebe a
        // pergunta barata; um suspeito e acordado a serio.
        probe: estado.provocar ? 'wake' : 'presence',
        reason: estado.estado,
      });
    }
  }

  return { emitir, observado, adrenalina };
}

/**
 * Quando dormir. O coracao nao bate o tempo todo -- dorme ate ao primeiro
 * compromisso que vencer. Um coracao parado nao custa nada; um cron fixo tem
 * de correr no periodo mais apertado que alguma coisa exija, sempre.
 */
export function proximoDespertar(orgaos, agora, opcoes = {}) {
  const cfg = { ...PADRAO, ...(opcoes.cfg || {}) };
  const base = t(agora);
  const prazos = [];

  for (const orgao of orgaos) {
    if (orgao.status === 'retired') continue;
    prazos.push(orgao.next_expected ? t(orgao.next_expected) : base);
  }
  // A adrenalina tambem tem prazo: o regresso a linha de base e agendado,
  // nao depende de alguem se lembrar de desligar.
  if (opcoes.adrenalinaAte) prazos.push(t(opcoes.adrenalinaAte));

  if (prazos.length === 0) return null;
  const proximo = Math.min(...prazos);
  return new Date(Math.max(proximo, base));
}

/**
 * Um sinal externo. Este e o ramo aberto: qualquer um que consiga mandar um
 * webhook consegue gastar adrenalina da empresa. Por isso a origem tem de ser
 * AUTENTICADA, nao apenas declarada, e o `occurred_at` do emissor nao vale
 * como hora do acontecimento -- e o campo que um atacante mentiria.
 */
export function admitirSinal(sinal, ctx, agora, cfg = PADRAO) {
  const recusa = (motivo) => ({ admitido: false, motivo });

  if (!sinal || typeof sinal !== 'object') return recusa('sinal-invalido');
  if (!sinal.source) return recusa('sem-origem');
  if (!ctx?.autenticado) return recusa('origem-nao-autenticada');

  const confianca = ctx.trust ?? 0;
  if (confianca <= 0) return recusa('origem-sem-confianca');

  // Hora declarada pelo emissor guarda-se como afirmacao; a hora institucional
  // e a da recepcao. Nunca se confunde uma com a outra.
  const recebido = new Date(t(agora));
  const declarado = sinal.occurred_at ? new Date(t(sinal.occurred_at)) : null;

  return {
    admitido: true,
    batimento: {
      branch: RAMO.SYM,
      author: sinal.source,
      trust: confianca,
      received_at: recebido,
      claimed_at: declarado,
      // Adrenalina decai sozinha. Nenhum organismo aguenta simpatico permanente.
      adrenalina_ate: new Date(recebido.getTime() + ms(cfg.decaimentoAdrenalinaMin)),
    },
  };
}

/**
 * O detector de poder paralelo.
 *
 * Um orgao morto falha em seguranca: nao faz nada. Um orgao paralelo age no
 * mundo sem autorizacao, sem registo e sem que ninguem saiba parar.
 *
 * Nao se encontra pelo cadastro -- nao se conhece o endereco. Encontra-se pelo
 * RASTO: para trabalhar tem de tocar em coisas que estao registadas.
 *
 * A regra nao e "tudo tem de ser agendado", porque isso seria contornado e o
 * contorno viraria o poder paralelo. A regra e: tudo tem de ser ATRIBUIVEL.
 * Nao-agendado com autor e um batimento extraordinario, e e legitimo.
 */
export function detectarParalelo(efeitos, batimentos, orgaosRegistados) {
  const porBatimento = new Set(batimentos.map((b) => b.id));
  const registados = new Set(orgaosRegistados.map((o) => o.id));
  const achados = [];

  for (const efeito of efeitos) {
    if (!efeito.created_by) {
      achados.push({ effect: efeito.id, motivo: 'sem-autor', gravidade: 'alta' });
      continue;
    }
    if (efeito.beat_id && !porBatimento.has(efeito.beat_id)) {
      achados.push({ effect: efeito.id, motivo: 'batimento-inexistente', gravidade: 'alta' });
      continue;
    }
    // Autor conhecido mas fora do cadastro: alguem age em nome de um orgao que
    // o coracao nao consegue observar.
    if (!registados.has(efeito.created_by)) {
      achados.push({ effect: efeito.id, motivo: 'autor-nao-registado', gravidade: 'alta' });
      continue;
    }
    // Sem batimento associado, mas com autor: extraordinario, nao ilegitimo.
    if (!efeito.beat_id) {
      achados.push({ effect: efeito.id, motivo: 'extraordinario', gravidade: 'nota' });
    }
  }
  return achados;
}

/**
 * O caminho da adrenalina tambem precisa de uma verificacao parassimpatica.
 * O silencio inverte-se entre os ramos: no agendado o silencio e suspeito, no
 * externo o silencio e o estado saudavel. Por isso os alarmes de incendio
 * testam-se todos os meses -- senao descobre-se que estava morto no dia do fogo.
 */
export function testeDoCanal(ultimoTesteEm, agora, cfg = PADRAO) {
  const base = t(agora);
  const ultimo = ultimoTesteEm ? t(ultimoTesteEm) : null;
  const intervalo = ms(cfg.frescuraMin * 4);
  if (ultimo === null) return { devido: true, motivo: 'nunca-testado' };
  if (base - ultimo > intervalo) return { devido: true, motivo: 'vencido' };
  return { devido: false };
}
