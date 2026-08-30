// Os controlos negativos do Documento 1, a correr.
//
// Cada teste tem o numero do controlo que torna executavel. Uma afirmacao que
// nao pode falhar nao e afirmacao -- aqui cada uma tem a observacao que a
// refutaria, e a observacao corre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAUDE, RAMO, PADRAO,
  proximoPrazo, estadoDe, varrer, proximoDespertar,
  admitirSinal, detectarParalelo, testeDoCanal,
} from '../lib/heartime/schedule.js';

const T0 = new Date('2026-08-23T12:00:00Z');
const mais = (min, base = T0) => new Date(base.getTime() + min * 60_000);

const orgao = (o = {}) => ({
  id: 'pf.office.strategy',
  status: 'active',
  freshness_minutes: 15,
  last_seen: T0,
  next_expected: mais(15),
  working: false,
  ...o,
});

// ─────────────────────────────────────────────────── controlo 1
// "a janela de frescura passa sem batimento e o sistema ainda reporta HEALTHY"
test('C1: evidencia fora da janela de frescura nunca e HEALTHY', () => {
  const parado = orgao({ last_seen: T0, next_expected: mais(15) });
  const depois = mais(PADRAO.frescuraMin + 1);

  const e = estadoDe(parado, depois);
  assert.equal(e.saude, SAUDE.UNKNOWN);
  assert.notEqual(e.saude, SAUDE.HEALTHY);
  assert.equal(e.provocar, true);
});

// ─────────────────────────────────────────────────── controlo 2 e 3
// "o intervalo e constante enquanto o estado epistemico muda"
// "um scope vai a UNKNOWN e o proximo batimento nao e antecipado"
test('C2/C3: a taxa e variavel e a observabilidade define-a', () => {
  const o = orgao();
  const saudavel = proximoPrazo(o, { health: SAUDE.HEALTHY }, T0);
  const doente = proximoPrazo(o, { health: SAUDE.UNHEALTHY }, T0);
  const incognito = proximoPrazo(o, { health: SAUDE.UNKNOWN }, T0);

  // Sabe menos -> olha mais depressa.
  assert.ok(incognito < doente, 'UNKNOWN tem de apertar mais que UNHEALTHY');
  assert.ok(doente < saudavel, 'UNHEALTHY tem de apertar mais que HEALTHY');

  // E nao sao todos iguais -- isso seria um metronomo.
  const distintos = new Set([+saudavel, +doente, +incognito]);
  assert.equal(distintos.size, 3);

  // HEALTHY relaxa, mas nunca alem da janela do contrato: passar a janela
  // e deixar de ter evidencia actual.
  const folgado = proximoPrazo(orgao({ freshness_minutes: 600 }), { health: SAUDE.HEALTHY }, T0);
  assert.ok(folgado <= mais(PADRAO.frescuraMin));
});

// ─────────────────────────────────────────────────── controlo 4
// "um orgao que nunca responde nunca mais e provocado"
test('C4: o prazo escreve-se na emissao, nao na resposta', () => {
  const mudo = orgao();
  // Eco null = nao respondeu. Tem de continuar a receber prazo.
  const prazo = proximoPrazo(mudo, null, T0);
  assert.ok(prazo instanceof Date);
  assert.ok(prazo > T0, 'um orgao calado tem de continuar agendado');

  // E tem de continuar a ser varrido, indefinidamente.
  let agora = T0;
  let visto = 0;
  for (let i = 0; i < 10; i++) {
    agora = mais(PADRAO.frescuraMin + 5, agora);
    const { emitir } = varrer([orgao({ last_seen: T0, next_expected: mais(15) })], agora);
    if (emitir.length) visto++;
  }
  assert.equal(visto, 10, 'quem dorme tem de ser provocado todas as vezes');
});

// ─────────────────────────────────────────────────── controlo 5
// "um evento perdido nao e reparado na varredura seguinte"
test('C5: level-triggered — o que se perdeu volta na passagem seguinte', () => {
  const atrasado = orgao({ next_expected: mais(-120), last_seen: mais(-200) });
  // Ninguem tratou disto ha duas horas. A varredura de agora tem de o apanhar
  // sem precisar de saber que houve um evento perdido.
  const { emitir } = varrer([atrasado], T0);
  assert.equal(emitir.length, 1);
  assert.equal(emitir[0].reason, 'overdue');
});

// ─────────────────────────────────────────────────── controlo 6
// "um componente nao registado e reportado HEALTHY"
test('C6: o cadastro e o contrato de cobertura', () => {
  const registados = [orgao({ id: 'a' }), orgao({ id: 'b' })];
  const { observado } = varrer(registados, T0);
  const vistos = observado.map((o) => o.organ_id);

  assert.deepEqual(vistos.sort(), ['a', 'b']);
  // Um orgao fora do cadastro nao aparece em lado nenhum -- e portanto nao
  // pode ser declarado saudavel por omissao.
  assert.ok(!vistos.includes('fantasma'));
});

// ─────────────────────────────────────────────────── controlo 7
// "um office com runtime apagado le-se saudavel durante uma semana"
test('C7: idle-nao-verificado nao e o mesmo que idle-verificado', () => {
  const idleVerificado = estadoDe(orgao({ last_seen: mais(-2) }), T0);
  assert.equal(idleVerificado.estado, 'idle');
  assert.equal(idleVerificado.saude, SAUDE.HEALTHY);

  // Mesmo orgao, mesmo "nao esta a trabalhar", so que ninguem o ve ha uma semana.
  const semana = 7 * 24 * 60;
  const apagado = estadoDe(orgao({ last_seen: mais(-semana), next_expected: mais(-semana + 15) }), T0);
  assert.equal(apagado.saude, SAUDE.UNKNOWN);
  assert.notEqual(apagado.saude, SAUDE.HEALTHY);

  // E um que nunca foi visto: registado nao e presente.
  assert.equal(estadoDe(orgao({ last_seen: null }), T0).estado, 'unverified');
});

// ─────────────────────────────────────────────────── controlo 8
// "cada passagem de liveness acorda todos os orgaos"
test('C8: barato sempre, caro so sob suspeita', () => {
  const saudaveis = Array.from({ length: 50 }, (_, i) =>
    orgao({ id: `o${i}`, last_seen: mais(-1), next_expected: mais(-1) }));
  const suspeito = orgao({ id: 'suspeito', last_seen: mais(-600), next_expected: mais(-500) });

  const { emitir } = varrer([...saudaveis, suspeito], T0);
  const caros = emitir.filter((e) => e.probe === 'wake');
  const baratos = emitir.filter((e) => e.probe === 'presence');

  assert.equal(caros.length, 1, 'so o suspeito devia ser acordado a serio');
  assert.equal(caros[0].organ_id, 'suspeito');
  assert.equal(baratos.length, 50);
});

// ─────────────────────────────────────────────────── controlo 9
// "um incidente nao adia a manutencao agendada"
test('C9: adrenalina preempta — suprime digestao, nao vigilancia', () => {
  const manutencao = orgao({ id: 'cadencia', last_seen: mais(-1), next_expected: mais(-1) });
  const morto = orgao({ id: 'morto', last_seen: mais(-600), next_expected: mais(-500) });

  const calmo = varrer([manutencao, morto], T0, { adrenalina: false });
  assert.equal(calmo.emitir.length, 2);

  const sobStress = varrer([manutencao, morto], T0, { adrenalina: true });
  const ids = sobStress.emitir.map((e) => e.organ_id);
  assert.ok(!ids.includes('cadencia'), 'manutencao saudavel adia-se sob adrenalina');
  assert.ok(ids.includes('morto'), 'descobrir que um orgao morreu nunca se adia');
});

// ─────────────────────────────────────────────────── controlo 10
// "um incidente por fechar deixa o sistema em alta frequencia indefinidamente"
test('C10: a adrenalina decai sozinha, com prazo', () => {
  const sinal = { source: 'pf.webhook.pagerduty', occurred_at: T0 };
  const { admitido, batimento } = admitirSinal(sinal, { autenticado: true, trust: 0.9 }, T0);

  assert.equal(admitido, true);
  assert.ok(batimento.adrenalina_ate instanceof Date);
  assert.ok(batimento.adrenalina_ate > T0, 'tem de ter fim');
  assert.equal(+batimento.adrenalina_ate, +mais(PADRAO.decaimentoAdrenalinaMin));

  // E o fim entra na fila: o coracao acorda para voltar a linha de base,
  // sem depender de alguem se lembrar de desligar.
  const despertar = proximoDespertar([orgao({ next_expected: mais(600) })], T0, {
    adrenalinaAte: batimento.adrenalina_ate,
  });
  assert.equal(+despertar, +batimento.adrenalina_ate);
});

// ─────────────────────────────────────────────────── controlo 11
// "a entrada de sinais esta morta e nenhuma verificacao agendada repara"
test('C11: o caminho da adrenalina leva uma verificacao parassimpatica', () => {
  assert.equal(testeDoCanal(null, T0).devido, true);
  assert.equal(testeDoCanal(null, T0).motivo, 'nunca-testado');

  const recente = testeDoCanal(mais(-5), T0);
  assert.equal(recente.devido, false);

  const antigo = testeDoCanal(mais(-PADRAO.frescuraMin * 5), T0);
  assert.equal(antigo.devido, true, 'o alarme de incendio testa-se sozinho');
});

// ─────────────────────────────────────────────────── controlo 12
// "um emissor nao autenticado define occurred_at e acredita-se nele"
test('C12: sinais sao admitidos, nao acreditados', () => {
  const mentira = { source: 'pf.webhook.qualquer', occurred_at: '1999-01-01T00:00:00Z' };

  assert.equal(admitirSinal(mentira, { autenticado: false, trust: 1 }, T0).admitido, false);
  assert.equal(admitirSinal(mentira, { autenticado: false, trust: 1 }, T0).motivo, 'origem-nao-autenticada');
  assert.equal(admitirSinal(mentira, { autenticado: true, trust: 0 }, T0).motivo, 'origem-sem-confianca');
  assert.equal(admitirSinal({ occurred_at: T0 }, { autenticado: true, trust: 1 }, T0).motivo, 'sem-origem');

  // Admitido: a hora do emissor guarda-se como AFIRMACAO, nunca como facto.
  const ok = admitirSinal(mentira, { autenticado: true, trust: 0.5 }, T0);
  assert.equal(ok.admitido, true);
  assert.equal(+ok.batimento.received_at, +T0, 'a hora institucional e a da recepcao');
  assert.equal(+ok.batimento.claimed_at, +new Date('1999-01-01T00:00:00Z'));
  assert.notEqual(+ok.batimento.received_at, +ok.batimento.claimed_at);
});

// ─────────────────────────────────────────────────── controlo 13
// "existe um efeito sem autor, sem run e sem batimento"
test('C13: tudo o que age tem de ser atribuivel', () => {
  const registados = [orgao({ id: 'pf.office.deploy' })];
  const batimentos = [{ id: 'beat-1' }];

  const achados = detectarParalelo([
    { id: 'e1', created_by: 'pf.office.deploy', beat_id: 'beat-1' },   // legitimo
    { id: 'e2', created_by: null, beat_id: null },                     // sem autor
    { id: 'e3', created_by: 'pf.office.deploy', beat_id: 'beat-999' }, // batimento que nao existe
    { id: 'e4', created_by: 'pf.ghost', beat_id: null },               // autor fora do cadastro
    { id: 'e5', created_by: 'pf.office.deploy', beat_id: null },       // extraordinario, legitimo
  ], batimentos, registados);

  const porId = Object.fromEntries(achados.map((a) => [a.effect, a]));
  assert.equal(porId.e1, undefined, 'o legitimo nao e apanhado');
  assert.equal(porId.e2.motivo, 'sem-autor');
  assert.equal(porId.e3.motivo, 'batimento-inexistente');
  assert.equal(porId.e4.motivo, 'autor-nao-registado');

  // A regra nao e "tudo tem de ser agendado" -- seria contornada, e o contorno
  // viraria o poder paralelo. Nao-agendado COM autor e legitimo.
  assert.equal(porId.e5.gravidade, 'nota');
  assert.equal(achados.filter((a) => a.gravidade === 'alta').length, 3);
});

// ─────────────────────────────────────────────────── o coracao dorme
test('o coracao dorme ate ao primeiro compromisso, e nao custa nada parado', () => {
  const orgaos = [
    orgao({ id: 'a', next_expected: mais(45) }),
    orgao({ id: 'b', next_expected: mais(5) }),   // este e o proximo
    orgao({ id: 'c', next_expected: mais(600) }),
    orgao({ id: 'z', status: 'retired', next_expected: mais(1) }),
  ];
  assert.equal(+proximoDespertar(orgaos, T0), +mais(5));

  // Relogios diferentes convivem sem metronomo: o de 600 minutos nao obriga
  // ninguem a acordar de 5 em 5.
  const semNada = proximoDespertar([], T0);
  assert.equal(semNada, null, 'sem obrigacoes, nao ha batimento');
});
