# BrowseMind — Fase 1

Extensão Chrome/Edge Manifest V3 que registra visitas e tempo de navegação ativa **apenas no dispositivo**. Sem servidor, conta, IA ou telemetria. A captura começa desativada e exige consentimento no popup.

## Instalar e executar

Requer Node.js 22.12+ (ou 24/26) e npm. Use uma versão LTS mantida.

```sh
npm ci
npm run build
```

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Habilite **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta `dist/` deste projeto.
4. Fixe o BrowseMind na barra e abra o popup.
5. Leia a explicação de privacidade e clique em **Autorizar e iniciar**.
6. Navegue por páginas HTTP/HTTPS em uma janela normal. Consulte os registros pelo popup.

Requer Chromium 120+. O diretório `dist/` contém o manifest, service worker e popup com todos os scripts e estilos locais. Para desenvolver, execute `npm run dev` (build em modo watch), carregue `dist/` e recarregue a extensão após alterações. Não há servidor de desenvolvimento nem hot reload remoto dentro da extensão.

## Comandos

| Comando                 | Finalidade                                             |
| ----------------------- | ------------------------------------------------------ |
| `npm run dev`           | Recompilar ao salvar                                   |
| `npm run build`         | TypeScript strict e bundle instalável                  |
| `npm test`              | Testes unitários e integração IndexedDB/Chrome mockado |
| `npm run test:coverage` | Cobertura V8 em `coverage/`                            |
| `npm run lint`          | ESLint                                                 |
| `npm run typecheck`     | Verificação de tipos                                   |
| `npm run format`        | Prettier                                               |

## Comportamento e privacidade

- Somente a aba ativa da janela normal em foco é elegível. Páginas internas, URLs inválidas, credenciais na URL e navegação anônima são ignoradas.
- O monitoramento pausa com perda de foco, inatividade ou bloqueio. O limiar inicial de inatividade é 60 segundos.
- A sanitização conserva apenas a origem (protocolo, domínio e porta); descarta todo caminho, query string e fragmento. O título apresentado é o domínio, nunca o título original da página. Esta é uma escolha conservadora: todos os sites são tratados como potencialmente sensíveis.
- Os domínios excluídos são configuráveis pelo popup e incluem subdomínios. Salvar exclusões interrompe o período atual e aplica a lista a visitas futuras; registros antigos podem ser removidos com **Excluir histórico**.
- **Pausar monitoramento** fecha o período ativo. **Excluir histórico** pede confirmação, pausa a captura e apaga visitas, sessões e checkpoints. A configuração de consentimento fica desativada; exclusões são preservadas.
- Não há content scripts, importação de histórico, conteúdo de páginas, formulários, cookies ou logs de URLs/títulos. URLs recebidas nas notificações são processadas transitoriamente; somente seus digests SHA-256 ficam em memória para deduplicação, sem persistência, e são removidos ao fechar a aba.
- CSP bloqueia conexões de rede no popup/worker; nenhuma dependência é carregada remotamente. Não há código de envio de dados.
- Datas são persistidas como ISO UTC e apresentadas no fuso local. O resumo diário divide intervalos na meia-noite local (incluindo mudanças de horário de verão).

## Permissões

| Permissão | Justificativa                                                                          |
| --------- | -------------------------------------------------------------------------------------- |
| `tabs`    | Ler URL/metadados da aba ativa e receber eventos de ativação, navegação e fechamento   |
| `storage` | Consentimento, exclusões e espelho operacional do checkpoint em `chrome.storage.local` |
| `idle`    | Detectar usuário inativo/bloqueado, limiar inicial de 60 s                             |
| `alarms`  | Reconciliar checkpoints em intervalos nominais de 30 s                                 |

Sem `host_permissions`, acesso ao histórico retroativo, cookies, downloads ou interceptação de requisições. O manifest desabilita modo anônimo. O armazenamento Chrome é restrito a contextos confiáveis.

## Decisões técnicas e precisão

TypeScript strict, React/Vite, Dexie/IndexedDB, Vitest, fake-indexeddb, ESLint e Prettier. A dependência transitiva minimatch usa override para a versão corrigida 11+, validada pelo lint. O motor é independente das APIs Chrome e da interface. Apenas o worker escreve no banco; o popup usa mensagens validadas e recebe dados sanitizados.

Visitas, sessões e checkpoint canônico são escritos na mesma transação IndexedDB. Depois do commit, o checkpoint é espelhado em `chrome.storage.local`. Em caso de falha entre os dois bancos, IndexedDB prevalece. Filas serializam eventos e comandos; checkpoints incrementais impedem crédito duplicado.

Os alarmes têm período nominal de 30 segundos. **Não há garantia de precisão de segundos.** O navegador pode atrasar alarmes, suspender o computador ou encerrar o worker. Em cada nova instância do worker, o período anterior termina no último checkpoint confirmado, sem creditar o intervalo desconhecido. Mesmo sem reinício, intervalos entre observações maiores que 45 s são descartados e geram outra visita. Isso favorece subcontagem, inclusive em navegação contínua se o worker for encerrado entre alarmes. Intervalos curtos de suspensão e a latência da detecção de inatividade não podem ser distinguidos perfeitamente de atividade real pelas APIs usadas.

A sessão lógica permanece aberta até 20 minutos sem atividade elegível, ou até o evento de inicialização do navegador. Esse timeout não soma tempo. Sessões sem atividade são encerradas na próxima reconciliação, e não por uma promessa de execução no instante exato do timeout. Reiniciar apenas o worker não necessariamente cria outra sessão lógica, mas sempre cria um novo período observado.

Um registro corresponde a um período contínuo elegível; retomar o mesmo site pode criar outra visita. Mudanças de URL na mesma aba também dividem o período, mesmo quando a sanitização produz a mesma origem. A lista exibe as últimas dez visitas; o resumo diário usa os registros persistidos e pode estar defasado até o próximo checkpoint. Os segundos mostrados são valores registrados, não uma garantia de precisão.

## Validação e próximos passos

Consulte [arquitetura](docs/ARCHITECTURE.md), [roteiro de testes](docs/TESTING.md) e [relatório de entrega](docs/DELIVERY.md). Os testes de navegador real exigem execução humana e não são apresentados como realizados.

Fase 2: definir classificação de interesses com consentimento próprio, agregações e gráficos analíticos; planejar paginação/agregação para históricos extensos. Nada disso faz parte da captura implementada nesta fase.
