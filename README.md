# Hast 0.56 — API privada de teste

Este repositório contém uma implementação independente e sanitizada. Nenhum arquivo ou segredo do ZIP original foi copiado.

## Rotas

- `GET /health`: verificação simples de disponibilidade.
- `POST /user/login`: devolve um perfil guest sintético e efêmero, sem persistência. O perfil sempre começa com `gems: 0` e `coins: 0`; qualquer credencial enviada é ignorada.
- `GET /api/tournaments`: proxy somente leitura para o endpoint de torneio de teste configurado no código. Não encaminha query strings nem cabeçalhos fornecidos pelo cliente.

Não há MongoDB, bot Discord, login Photon, autenticação oficial, economia, matchmaking, alterações de perfil, finalização de partidas nem escrita/administração de torneios.

## Execução local

Requer Node.js 22 ou posterior. Execute `npm start`; o servidor usa `PORT` se definido e vincula em `0.0.0.0`.

## Render

Serviço web Node, comando de build `npm install --omit=dev` e comando de inicialização `npm start`. Não são necessárias variáveis secretas nem banco de dados. O plano e a região devem ser escolhidos explicitamente na criação.
