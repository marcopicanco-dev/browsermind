# Testes e evidências

## Automatizados

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
TZ=America/Sao_Paulo npm test
TZ=America/New_York npm test
```

`tracking.test.ts` usa relógio controlado e IndexedDB real em memória (`fake-indexeddb`). Exercita URLs elegíveis/internas/inválidas, sanitização, credenciais, exclusões, anônimo, captura desligada inicialmente, alternância de abas/janelas, foco/idle/bloqueio/fechamento representados como perda de elegibilidade, mudança de URL, timeout de sessão, recuperação do worker, reabertura de banco após encerramento, suspensão prolongada, duplicatas concorrentes, relógio regressivo, exclusão, falha de espelho, rollback transacional e meia-noite local. Executar em dois fusos verifica que a divisão diária não depende de UTC.

`chrome.test.ts` integra os listeners reais do adaptador com mocks das APIs Chrome: registro síncrono dos eventos, criação do alarme, limiar idle, consentimento, foco, locked, ativação, atualização duplicada, fechamento, exclusões, mensagens não autorizadas e exclusão com pausa. Esses mocks não substituem a validação em navegador real.

A cobertura inclui explicitamente motor, adaptador Chrome, banco, tipos e utilitários. O popup React é validado pelo roteiro manual abaixo; não está incluído na cobertura automatizada. O relatório HTML fica em `coverage/index.html`.

## Roteiro manual — pendente de execução humana

Use um perfil de teste, sem dados pessoais. Não abra links com tokens reais. Registre navegador/versão, sistema, fuso e horário de cada observação. Marque os itens somente após executar.

- [ ] **Instalação:** `npm run build`; carregar `dist/` via `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação. Nenhum erro no cartão da extensão; popup abre com monitoramento pausado e histórico vazio.
- [ ] **Sem consentimento:** navegar em `https://example.com` por um minuto. O histórico continua vazio.
- [ ] **Captura:** autorizar no popup; ficar em example.com por 65 s. Reabrir o popup. Deve haver visita, domínio e tempo confirmado. Subcontagem por reinício do worker é permitida e documentada.
- [ ] **Abas:** alternar example.com e outra página HTTPS várias vezes, aguardando alguns segundos em cada. O período anterior fecha; o tempo total não deve exceder o tempo elegível transcorrido. Não exigir a captura de toda aba exibida por poucos milissegundos.
- [ ] **Janelas:** abrir uma segunda janela normal e alternar entre elas. Somente a aba da janela em foco recebe tempo.
- [ ] **Foco externo:** focar outro aplicativo por 90 s e retornar. Esse intervalo não deve ser creditado ao site anterior.
- [ ] **Idle:** deixar o computador sem interação por mais de 60 s. Após a detecção, não deve continuar acumulando. Retomar entrada reinicia um período; os 60 s de latência da detecção são uma limitação conhecida.
- [ ] **Bloqueio:** bloquear o computador por dois minutos e desbloquear. O período bloqueado não deve ser creditado.
- [ ] **URL na mesma aba:** navegar de `https://example.com/?demo=1#x` para `https://example.com/?demo=2#y`. Uma mudança de URL notificada divide a visita. Inspecionar o banco: somente `https://example.com/` e título `example.com` devem estar gravados.
- [ ] **Páginas não elegíveis:** abrir chrome://settings, edge://settings (no Edge), about:blank, file:// e uma janela anônima. Não devem aparecer visitas dessas páginas nem dados da janela anônima.
- [ ] **Fechamento da aba:** fechar a aba ativa. O registro fecha e não continua recebendo tempo enquanto outra página não elegível estiver em foco.
- [ ] **Pausa:** clicar em Pausar monitoramento, navegar e aguardar. Nenhuma nova visita ou duração adicional após a pausa.
- [ ] **Exclusões:** salvar `example.com`; visitar também um subdomínio controlado. Não deve criar novas visitas nesses domínios. Uma origem parecida como notexample.com não deve ser excluída por correspondência parcial.
- [ ] **Sessão:** manter a captura autorizada, perder foco por mais de 20 min e voltar. Deve criar outra sessão, fechando a anterior no último instante ativo. O intervalo de espera não é tempo ativo.
- [ ] **Worker:** com uma visita ativa, aguardar um checkpoint, encerrar o worker pela página de gerenciamento de service workers do navegador, aguardar e retomar navegação. A visita antiga deve ficar interrupted no checkpoint, sem incluir a lacuna. Não manter DevTools do worker aberto durante essa medição, pois ele altera o ciclo de vida.
- [ ] **Navegador:** após um checkpoint, fechar totalmente o navegador, esperar dois minutos e reabrir. O histórico persiste; tempo fechado não é creditado. A inicialização encerra a sessão anterior e a captura autorizada pode iniciar nova visita elegível.
- [ ] **Suspensão:** suspender o computador por alguns minutos e retornar. O período desconhecido é descartado. Suspensões inferiores ao limiar de 45 s podem não ser detectadas.
- [ ] **Meia-noite/fuso:** em perfil/sistema de teste, observar uma visita cruzando meia-noite local. O tempo de hoje considera apenas a parte depois da meia-noite. Também executar a suíte com os fusos indicados acima; não alterar o relógio do sistema principal para este teste.
- [ ] **Interface:** conferir lista limitada a dez visitas, horários locais, título sanitizado, métricas e ausência de dados; testar navegação por teclado e largura do popup.
- [ ] **Excluir:** cancelar a confirmação preserva os dados; confirmar remove visitas/sessões/checkpoints, pausa captura e mostra histórico vazio. Reabrir o navegador e confirmar que não reaparecem.
- [ ] **Erro de armazenamento:** em perfil descartável, usar breakpoint antes de uma operação IndexedDB e simular falha de gravação/indisponibilidade pelo ambiente de teste. A ação deve informar erro, sem mostrar sucesso. Não alterar bancos de produção para esse teste.
- [ ] **Rede:** nas ferramentas do popup/worker, verificar que não há requisições externas da extensão durante captura ou uso do popup. As navegações das próprias páginas não são tráfego da extensão.
- [ ] Repetir instalação, consentimento, captura, pausa e exclusão no Edge.

## Coletar evidências

Salvar saída dos comandos e versão do Node/npm; guardar `coverage/` e a listagem de `dist/`. Para testar persistência, usar DevTools do worker → Application → IndexedDB → BrowseMind (visits/sessions/checkpoints); configurações e espelho podem ser consultados com `chrome.storage.local.get(null)` no console do worker. Não publicar capturas contendo domínios pessoais. Registrar resultados efetivos, inclusive subcontagem e limitações, sem preencher itens que não foram executados.
