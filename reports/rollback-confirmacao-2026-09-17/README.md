# Estado anterior à confirmação por campo

Arquivos copiados antes da implementação de 17/09/2026. Incluem as correções anteriores R01–R06 que ainda não estavam em commit.

Se o usuário pedir para voltar, executar na raiz do projeto:

```powershell
Copy-Item -LiteralPath reports/rollback-confirmacao-2026-09-17/content.js -Destination content.js
Copy-Item -LiteralPath reports/rollback-confirmacao-2026-09-17/content.test.cjs -Destination tests/content.test.cjs
```

Depois, recarregar a extensão e a página do HubSpot. Isso não altera o armazenamento de presets. Os relatórios podem permanecer como histórico, mas o status do handoff deve registrar a reversão.

Se houver mudanças posteriores nesses arquivos, comparar antes de restaurar para não sobrescrever trabalho novo.

SHA256 original:

- content.js: B3B6376C0B2B813924B9B90106BF82E05022406F98289E21F76A1A5EE68ADD78
- content.test.cjs: B112F075C19F70CF2342222F58A6ADB4A7F173117F256B0BEC1578BC670AA0E8
