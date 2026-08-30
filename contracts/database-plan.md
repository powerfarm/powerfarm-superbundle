# Plano da base

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Contracts` · **PLAN**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../canon/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Método: primeiro olha-se o que existe, depois o que se propôs a ser, e só então
se analisa se o que existe é um início do objectivo ou está errado.

As duas primeiras versões deste ficheiro saltaram o passo do meio. Julgaram o
que existe contra um critério inventado — arrumação — em vez de contra o que
cada coisa declarou ser. Daí saíram um plano de sete etapas para uma escala que
não existe, e um génesis que teria sido o quadragésimo sexto.

---

## 1. O que existe

Medido 2026-08-23, em `evidence/db-state-2026-08-23.json`.

```text
19 tabelas · 42 políticas · 58 chaves · 25 funções · 28 linhas
```

E fora de `public`, o que não se toca:

```text
adk                     criado pelo motor
auth                    1 conta · 1 cliente OAuth · 10 autorizações · 4 sessões
```

---

## 2. O que se propôs a ser

Está escrito nos cabeçalhos das próprias migrations. Ninguém teve de adivinhar.

**`0001 identity`** — *«quem existe, que chave é de quem, e quem é quem no
Supabase Auth. É a cola: o `user_id` do ADK, o sign-in do Cloudflare OS e o
bearer dos LABs passam todos a apontar para o mesmo id.»*
E o `occupancies` guarda quem estava na cadeira, para que *«um run grave as duas
coisas — quem assinou, durável, e quem executou, efémero.»*

**`0002 manifest`** — *«o registry não é armazém. Guarda a declaração de que a
PowerFarm reconhece um artefacto exacto, de uma fonte exacta, numa versão
exacta. Não há coluna `content`; há `source_repo`, `source_commit`,
`source_path` e `sha256`.»*

**`0003 autoridade`** — *«as duas anteriores registam o que as coisas SÃO. Esta
regista o que ACONTECE, e quem responde por isso. `grants`: o mandato do cargo.
**Sem ele a assinatura não atesta nada.**»*

**`0004 adk_runtime`** — *«Compute may disappear after every request. The mutable
run row is the current state; ADK events and run checkpoints are append-only
provenance.»*

**`gadget_lineage`** — *«Registry resolves immutable truth. Gatekeeper authorizes
the resolved snapshot. Disposable compute receives only the resulting
envelope.»*

---

## 3. É início do objectivo, ou está errado?

Cada declaração tem um teste, e os testes correm.

```text
manifest        4 de 4 versões com source_repo + source_commit +
                source_path + sha256
                → INÍCIO CORRECTO, E A FUNCIONAR.
                  Faz exactamente o que disse: declara sem armazenar.

lineage         2 de 2 revisões com definition_hash
                → INÍCIO CORRECTO, E A FUNCIONAR.

identity        18 chaves estrangeiras apontam-lhe. A cola cola.
                identity_keys 0 · occupancies 0
                → INÍCIO CORRECTO, METADE POR USAR.
                  Ninguém tem chave. Ninguém se sentou numa cadeira.

autoridade      runs com cargo        5 de 5
                runs com ocupante     0 de 5
                runs com grant        2 de 5
                grants                0
                approvals             0
                → ESTÁ ERRADO.
```

### Onde está errado, e porquê importa

A `0003` escreve a sua própria condição de falha: *«sem ele a assinatura não
atesta nada.»* Há **zero grants** e cinco runs. Pela definição da própria
migration, nada do que aconteceu atesta o que quer que seja.

E o `runs` grava `office_id` em 5 de 5, e `occupancy_id` em **0 de 5**.

Isso é metade exacta da distinção central de toda a arquitectura — cargo durável
contra ocupante efémero — e é a metade que falta. O sistema regista quem assinou.
Nunca registou quem executou.

Não é erro de desenho. As tabelas existem, as colunas existem, as chaves
existem. É que **nada as preenche**. O caminho está construído e ninguém passa
por ele.

---

## 4. O que isto muda no plano

O passo 2 muda a conclusão por inteiro.

Quatro dos cinco subsistemas são inícios correctos do que declararam ser, e dois
deles funcionam exactamente como escrito. Isto não é uma base para arrumar. É
uma base onde quase tudo está certo e há **um buraco**, e o buraco é
identificável, pequeno e nomeado.

```text
NÃO FAZER
  mover as 19 tabelas          não estão erradas
  génesis                      deitaria fora quatro inícios correctos
  documentar dívida            não há dívida; há um caminho por usar

FAZER
  public fecha e não cresce    já feito. custa zero.
  preencher occupancy_id       um run tem de gravar quem executou,
                               não só quem assinou
  emitir grants                enquanto forem zero, os runs não atestam
                               nada, por definição da própria 0003
```

---

## 5. O que fica por fazer, e é pequeno

```text
main do registry 4 migrations atrás
  0003 · 0004_adk_runtime · 0005 · gadget_lineage vivem em
  codex/powerfarm-v0.1. Levá-las para main não corre SQL nenhum.

0004_admit_brand_v03 não aplicada
  Verificado: as 4 versões são todas @0.2, semeadas pela 0002.
  A marca 0.3 nunca entrou. Não é dívida, é um ficheiro por correr.

attention e heartime escritas, não aplicadas
  Ambas em schema próprio. Não tocam nas 19.
  Antes de attention: trocar current_identity_id() por
  identidade_atual(), que já existe.
```

---

## 6. Correcção registada

Uma versão anterior deste ficheiro dizia que `0004_admit_brand_v03` estava
aplicada mas não registada, e chamava-lhe dívida documentada.

Errado. A inferência foi *«os artefactos de marca existem, logo correu»*, e o que
se devia ter olhado era o número da versão. Diz `0.2`. A migration nunca correu,
e nunca houve colisão na base — só dois ficheiros com o mesmo número no disco.

---

Copyright © 2026 PowerFarm. All rights reserved.
