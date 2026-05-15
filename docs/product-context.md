# Product Context

## Problema

Ferramentas atuais de uso local com agentes tendem a fragmentar a operação: vários terminais, múltiplos projetos, alterações Git acontecendo em paralelo e pouca visibilidade sobre qual agente fez o quê. O resultado é perda de contexto, erros de operação e dificuldade para retomar sessões depois de reiniciar a máquina.

## Público

- Staff e Senior engineers
- Developers que operam mais de um agente localmente
- Tech leads que querem rastreabilidade operacional sem subir uma infraestrutura remota
- Usuários Linux com fluxo intensivo em terminal, IDE e Git

## Diferencial

- Múltiplos projetos na mesma janela
- PTY isolado por terminal
- Estado persistido localmente
- Git changes, diff e history ao lado do terminal
- Heurística explícita de suspeita “Multi-agent”
- Configuração por projeto via `.agent-workspace.json`

## Fluxo principal

1. Usuário abre o Agent Workbench.
2. Seleciona um workspace salvo.
3. Seleciona um projeto local já existente.
4. Visualiza templates de terminais definidos na configuração do projeto.
5. Abre um ou mais agentes/terminais.
6. Acompanha output persistido, mudanças Git, diff e histórico.
7. Abre projeto ou arquivo na IDE configurada.

## UX desejada

- Operacional, densa e legível.
- Priorização visual de estado: waiting-input, error, running, completed.
- Navegação rápida entre projetos sem perder histórico.
- Layout orientado a “mission control”, não a formulário.
- Terminais com leitura confortável e contexto lateral permanente.
