# Como modificar o agente e lançar uma nova versão

Este guia explica o passo a passo completo: desde fazer uma alteração no código até disponibilizar os instaladores (`.dmg` para Mac e `.exe` para Windows) para download.

---

## Visão geral do processo

```
Você edita o código → faz commit → cria uma tag → dá push →
GitHub Actions builda automaticamente → instaladores ficam disponíveis para download
```

Você não precisa de máquina Windows. O GitHub cuida do build dos dois sistemas operacionais.

---

## Passo a passo

### 1. Faça as alterações no código

Edite os arquivos normalmente. Os arquivos principais do agente estão em `src/`:

| Arquivo | O que faz |
|---|---|
| `src/server.js` | Servidor HTTP, rotas e CORS |
| `src/printers.js` | Listagem de impressoras do sistema |
| `src/config.js` | Configurações e origens permitidas |
| `src/main.js` | Inicialização do Electron |
| `src/tray.js` | Ícone e menu da bandeja do sistema |

### 2. Atualize o número de versão

Abra o `package.json` e incremente o campo `version`:

```json
"version": "1.0.1"
```

Use o padrão `MAJOR.MINOR.PATCH`:
- **PATCH** (1.0.0 → 1.0.**1**): correção de bug pequeno
- **MINOR** (1.0.0 → 1.**1**.0): funcionalidade nova, sem quebrar nada
- **MAJOR** (**2**.0.0): mudança grande que quebra compatibilidade

### 3. Faça o commit das alterações

```bash
cd /Users/bueno/Code/print-agent

git add .
git commit -m "Descreva aqui o que foi alterado"
git push
```

> Este push sozinho **não** gera uma release. Ele apenas sobe o código e verifica se o build continua funcionando.

### 4. Crie a tag da nova versão

A tag precisa corresponder exatamente à versão que você colocou no `package.json`. Se colocou `1.0.1`, a tag é `v1.0.1`:

```bash
git tag v1.0.1
git push origin v1.0.1
```

Pronto. A partir daqui o GitHub cuida de tudo automaticamente.

### 5. Acompanhe o build

1. Acesse o repositório no GitHub
2. Clique na aba **Actions**
3. Você vai ver o build rodando com dois jobs em paralelo: `DMG (macOS)` e `EXE (Windows)`
4. Aguarde ~5 minutos até os dois ficarem com o ícone ✅ verde

Se algum ficou com ❌ vermelho, clique nele para ver o log de erro.

### 6. Baixe os instaladores

Quando o build terminar:

1. No repositório, clique na aba **Releases** (no menu lateral direito da página principal)
2. A versão que você tagueou vai aparecer no topo
3. Em **Assets**, estão os arquivos:
   - `Print Agent-X.X.X.dmg` → instalador para Mac
   - `Print Agent Setup X.X.X.exe` → instalador para Windows

---

## Instalando no Mac — erro "danificado e não pode ser aberto"

O app não tem assinatura digital da Apple (requer conta de desenvolvedor paga). Para uso interno, basta assinar localmente com dois comandos no Terminal após instalar:

```bash
xattr -cr "/Applications/Agente de Impressão - Operação Fácil.app"
codesign --force --deep --sign - "/Applications/Agente de Impressão - Operação Fácil.app"
```

Depois abra normalmente. Só precisa fazer isso uma vez por instalação.

---

## Resumo rápido (para as próximas vezes)

```bash
# 1. Edite o código e atualize a versão no package.json

# 2. Commit e push
git add .
git commit -m "Descrição da alteração"
git push

# 3. Tag e push da tag (substitua pelo número da versão)
git tag v1.0.2
git push origin v1.0.2

# 4. Aguarde ~5 min e baixe os instaladores na aba Releases do GitHub
```

---

## Dúvidas frequentes

**Errei a tag, como corrijo?**
```bash
git tag -d v1.0.1                  # apaga local
git push origin --delete v1.0.1   # apaga no GitHub
git tag v1.0.1                     # recria
git push origin v1.0.1
```

**Quero testar o build sem criar uma release?**
Basta fazer push normalmente sem criar tag. O build roda, mas o resultado fica disponível por apenas 7 dias como artifact (aba Actions → clique no build → seção Artifacts).

**Onde fica o histórico de todas as versões?**
Na aba **Releases** do repositório. Todas as versões lançadas ficam lá para sempre.
