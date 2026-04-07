---
description: Como abrir e testar o site localmente (Garimpo da Moda)
---

# Teste Local do Site

## Importante - Problemas conhecidos

- O browser subagent **NÃO consegue** acessar URLs `file:///` diretamente.
- A solução mais confiável é iniciar um servidor HTTP local via `npx serve`.
- **NUNCA** tente abrir o site via `file:///g:/Meu Drive/BRECHO/site/index.html` no browser subagent.

## Passo a passo

1. Inicie o servidor local na pasta do site:
// turbo
```bash
npx -y serve -l 8080
```
Diretório de trabalho: `g:\Meu Drive\BRECHO\site`

2. Aguarde o servidor iniciar (~3 segundos), verifique com `command_status`.

3. Acesse o site no browser subagent via:
```
http://localhost:8080
```

4. Para o usuário testar manualmente, ele pode:
   - Navegar para `G:\Meu Drive\BRECHO\site\index.html` no Windows Explorer e abrir no navegador
   - Ou acessar `http://localhost:8080` enquanto o servidor estiver rodando

## Estrutura do Projeto

- `index.html` - Página principal (vitrine + checkout)
- `admin.html` - Painel administrativo
- `app.js` - Lógica principal (carrinho, checkout, Mercado Pago)
- `admin.js` - Lógica do painel admin
- `style.css` - Estilos do site
- `supabase/functions/` - Edge Functions (pagamento, webhook)
- `img/` - Imagens e logo

## Deploy

O site é hospedado no GitHub Pages com o domínio `garimpodamoda.com.br`.
Para deploy, fazer push para a branch principal do repositório Git.
