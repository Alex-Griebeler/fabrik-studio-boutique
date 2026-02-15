

# Documento "Perguntas e Respostas da Luciana" -- Mapa Dor-Solucao

## Objetivo

Criar um documento de referencia com perguntas-base e respostas prontas para cada dor do cliente, escritas em linguagem conversacional (como a Luciana falaria no WhatsApp), mas sustentadas por argumentos tecnicos reais do metodo Fabrik. Este documento sera salvo no projeto (pasta `docs/`) e tambem publicado no Notion.

## Dores Mapeadas (9 total)

| # | Dor | Perfil tipico |
|---|-----|---------------|
| 1 | Emagrecimento / Estetica | Quer perder gordura, melhorar composicao corporal |
| 2 | Energia / Disposicao | Cansaco cronico, rotina pesada |
| 3 | Dor / Lesao | Historico de dor articular, medo de piorar |
| 4 | Falta de constancia | Comeca e para, nao mantem rotina |
| 5 | Ganho de massa muscular | Quer corpo mais firme, definido |
| 6 | Performance / Ja treina | Atleta recreativo ou pessoa avancada |
| 7 | Longevidade | Quer envelhecer bem, manter autonomia |
| 8 | Motivacao | Perdeu vontade, nao se sente motivado |
| 9 | Falta de resultado | Treina mas nao ve mudanca |

## Estrutura do Documento

Para cada dor, o documento tera:

### Bloco por Dor

```text
## [NOME DA DOR]

**Pergunta de triagem**
A pergunta rapida que a Luciana faz para confirmar a dor.
Ex: "Voce sente que o principal incomodo hoje e mais estetico ou mais de disposicao?"

**Pergunta de aprofundamento** (opcional, se fluir)
Ex: "Voce ja tentou resolver isso antes? O que nao funcionou?"

**Resposta-solucao** (argumento tecnico em linguagem simples)
O texto exato que a Luciana usaria para conectar a dor a solucao Fabrik.
Ex: "Quando o treino funcional e bem estruturado, o corpo trabalha varios
grupos musculares ao mesmo tempo. Isso faz o gasto energetico ser ate 4 vezes
maior do que num treino de musculacao tradicional. Aqui na Fabrik, como o grupo
e pequeno e tem dois treinadores, cada exercicio e ajustado pra voce de verdade."

**Ponte para o convite**
A frase de transicao para a sessao de boas-vindas.
Ex: "Que tal conhecer isso na pratica? Posso ver um horario pra voce."
```

## Implementacao Tecnica

### Passo 1 -- Criar o documento no projeto
- Arquivo: `docs/FABRIK_MAPA_DOR_SOLUCAO.md`
- Conteudo: as 9 dores completas no formato acima
- Voce revisa e ajusta as respostas antes de eu inserir no prompt

### Passo 2 -- Publicar no Notion
- Criar uma pagina no workspace com o mesmo conteudo
- Formatacao nativa do Notion (headings, tabelas, toggle blocks)

### Passo 3 -- Integrar ao prompt da Luciana
- Apos sua validacao do documento, inserir a secao MAPA DOR-SOLUCAO no `system_prompt`
- Atualizar a ESTRUTURA DA CONVERSA de 7 para 8 passos (adicionando "Apresentar solucao especifica" entre espelhamento e posicionamento)
- Atualizar a MATRIZ DE INTENCAO para referenciar o mapa

### Passo 4 -- Teste
- Enviar mensagens simuladas para cada dor e validar que a Luciana:
  - Identifica a dor corretamente
  - Apresenta o argumento certo em linguagem natural
  - Faz a ponte para o convite sem pressao

## Dependencia

O passo 3 so acontece apos voce validar o conteudo do documento (passos 1 e 2). Assim voce tem controle total sobre o tom e os argumentos antes de qualquer coisa entrar no prompt.

