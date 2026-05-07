# Contexto Fabrik — Agente de Detecção de Faltas

## Princípio que governa o tom

Aluno que sente que ALGUÉM PERCEBEU sua ausência volta. Aluno que
sente que ninguém percebeu vai embora.

A mensagem do agente vai pro TREINADOR, não pro aluno. Mas o objetivo
final é fazer o treinador agir cedo, com cuidado, antes do aluno
sumir de vez.

## A regra do P3 (processo formal de Presença e Reativação)

- Treinador dá presença/falta no EVO em até 30min após a aula
- Raquel (recepção tarde) audita o EVO no fim do dia
- Aluno com 2 faltas seguidas sem aviso = candidato à reativação
- Treinador faz contato em 24h
- Se treinador não fizer, Raquel cobre

O agente automatiza só a detecção e o alerta inicial. Contato com
aluno continua humano (treinador). Cobertura por Raquel continua
humana.

## Mensagem que o TREINADOR manda pro aluno (humano, não agente)

Tom de referência (treinador adapta):

"Oi [Nome], senti tua falta nos últimos treinos. Tá tudo bem?
Qualquer coisa que tenha rolado, me conta. Quero te ver de volta
na sequência."

Tom: cuidado, não cobrança. Pessoal, não automatizado.

## Mensagem que a RAQUEL manda quando treinador não cobre em 24h

"Oi [Nome], aqui é a Raquel da Fabrik. Notamos que você faltou nas
últimas aulas. Tá tudo bem? Qualquer coisa que tenha rolado, me
chama por aqui — quero te ajudar a voltar pro ritmo."

## Tom da Fabrik (importante pro template do alerta interno)

- Direto, brasileiro, sem jargão
- Sem urgência fabricada, sem caps lock, sem emoji exagerado
- Cuidado, nunca pressão
- Premium silencioso (Hermès × Aesop, não academia tradicional)

## Regras de negócio reforçadas

- Cancelamento com 12h+ de antecedência NÃO conta como falta
- Falta = aula agendada onde aluno não fez check-in
- Faltas em qualquer modalidade contam (não precisa ser mesma turma)
- PT (personal training): 1 falta já dispara alerta
- Treinador de férias/folga: alerta vai direto pra Raquel
- Janela de silêncio: se treinador já registrou contato com aluno
  nos últimos 3 dias, suprime alerta

## Onde costuma falhar (pra agente proteger contra isso)

- Treinador esquece de dar presença na correria entre aulas
- Treinador não responde mensagem sobre aluno sumido
- Aluno fica 1 semana sumido antes de alguém perceber

## O que o agente NÃO faz

- NÃO manda mensagem direto pro aluno (apenas pro treinador)
- NÃO substitui o contato humano do treinador
- NÃO toma decisão sobre o aluno (só sinaliza)
- NÃO escala antes de 24h sem ack do treinador
- NÃO dispara em horário social (antes de 9h, depois de 19h,
  fim de semana, feriado)

## Métricas que o sistema deve permitir medir depois

- % de aulas com presença lançada pelo treinador no dia (meta 100%)
- % de alunos com 2+ faltas seguidas que receberam contato em 48h
  (meta 100%)
- % de reativações feitas pelo treinador (e não pela Raquel cobrindo)
  (meta 80%+)
- Tempo médio entre detecção e contato do treinador
