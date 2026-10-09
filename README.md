# Inter Ocean — Website institucional

Site estático multipágina da **Inter Ocean** (International Trading Company · Orlando, Florida), em inglês americano.

- **Stack:** HTML5 semântico · CSS3 moderno (sem frameworks) · JavaScript ES Modules · [GSAP](https://gsap.com) + ScrollTrigger + SplitText · [Vite 8](https://vite.dev) (build multipágina).
- **Hospedagem:** saída 100% estática (`dist/`), pronta para a Vercel.
- **Páginas:** `/` · `/about/` · `/products/` · `/global-trade/` · `/business/` · `/contact/` · `/credits/` (créditos das mídias provisórias) · `404.html`.

---

## 1. Como rodar

Requisitos: **Node.js 20+** (testado com Node 24) e npm.

```bash
npm install          # instala dependências
npm run dev          # servidor local em http://localhost:5173
npm run build        # gera o site de produção em dist/
npm run preview      # serve o build de produção em http://localhost:4173
```

Scripts de mídia (detalhes nas seções 4 e 5):

```bash
npm run images                          # otimiza imagens (AVIF/WebP + srcset + manifest + og-image)
npm run hero:encode -- <video> [opções]  # prepara o vídeo da Hero para scroll-scrubbing
```

---

## 2. Estrutura do projeto

```
site-interocean/
├─ index.html, about/, products/, global-trade/, business/, contact/, credits/, 404.html
├─ partials/              head.html · header.html · footer.html · cta.html (componentes HTML reutilizáveis)
├─ plugins/
│  └─ vite-plugin-site.js  composição em tempo de build (partials, logo, <picture>, mídia da Hero, sitemap)
├─ scripts/
│  ├─ optimize-images.mjs  pipeline de imagens (sharp)
│  └─ hero-media.mjs       codificação do vídeo da Hero (ffmpeg-static)
├─ assets-src/images/      ORIGINAIS das imagens (você substitui aqui)
├─ public/                 copiado como está para dist/
│  ├─ assets/logos/        logo-primary · logo-negative · logo-symbol · favicon
│  ├─ assets/images/       imagens GERADAS por `npm run images` (não editar à mão)
│  ├─ assets/videos/       hero-scroll.mp4 · hero-scroll-mobile.mp4 · (hero-scroll.webm opcional)
│  ├─ assets/frames/hero/  sequência de imagens opcional (estratégia Canvas)
│  ├─ assets/fonts/        Sora e Work Sans (auto-hospedadas, licença OFL)
│  └─ favicon.svg, apple-touch-icon.png, site.webmanifest
├─ src/css/
│  ├─ tokens.css           cores, gradiente, tipografia, espaçamentos, raios, motion, breakpoints
│  ├─ base.css · layout.css · components.css · header.css · footer.css · forms.css
│  ├─ sections/hero.css · sections/home.css · sections/pages.css
│  ├─ animations.css       estados iniciais de animação, view transitions, reduced motion
│  └─ responsive.css       casos gerais (telas pequenas, landscape baixo, 1920+, impressão)
├─ src/js/
│  ├─ main.js              entrada: carrega módulos sob demanda (code splitting)
│  ├─ config.js            constantes centrais (breakpoints, motion, HERO, FORM)
│  ├─ navigation.js        header, menu mobile, barra de progresso
│  ├─ animations.js        sistema de reveal/parallax/linhas via data-attributes
│  ├─ scroll-video.js      controladores de scrubbing (vídeo · frames · poster)
│  ├─ forms.js             formulário de contato
│  └─ components/          hero · approach · global-stage · category-preview · site-info · countries
├─ vite.config.js · vercel.json · .env.example
```

Os cabeçalhos/rodapés **não** são injetados por JavaScript: o plugin do Vite monta o HTML final no build, então as páginas são HTML estático completo (bom para SEO e para quem navega sem JS).

### Diretivas HTML do plugin

| Diretiva | Função |
|---|---|
| `<!-- @include header theme="dark" active="about" -->` | Insere `partials/header.html`; atributos viram `{{placeholders}}`; marca o item ativo com `aria-current="page"`. |
| `<!-- @logo variant="primary" class="…" -->` | Logo oficial: usa `.svg` se existir, senão `.png`, senão o texto “INTER OCEAN”. |
| `<!-- @picture name="category-energy-solar" alt="…" sizes="…" -->` | `<picture>` responsivo AVIF + WebP com `srcset`, dimensões intrínsecas (sem layout shift) e placeholder desfocado. |
| `<!-- @hero-media -->` | Poster + atributos de mídia da Hero — **somente para arquivos que existem**. |
| `<!-- @icon btn-arrow -->` | Ícones SVG inline decorativos (`arrow`, `arrow-down`, `arrow-up-right`, `mail`, `pin`). |

---

## 3. Arquivos da marca

Coloque os arquivos oficiais em **`public/assets/logos/`** com estes nomes:

| Arquivo | Uso |
|---|---|
| `logo-primary.svg` | Logo horizontal colorido (fundos claros) — header claro |
| `logo-negative.svg` | Logo horizontal negativo (fundos Azul Oceano) — header sobre a Hero, menu mobile, rodapé, card de contato, imagem de compartilhamento |
| `logo-symbol.svg` | Símbolo isolado |
| `favicon.svg` | Ícone do site |

**Estado atual:** estão em uso as versões oficiais em PNG da pasta `LOGO/` (`logo-primary.png`, `logo-negative.png`, 1000×164) e o símbolo vetorial oficial (`onda-simbolo-vetor.svg` → `logo-symbol.svg`). Ao adicionar os `.svg`, o build passa a usá-los automaticamente (prioridade SVG → PNG → texto). Nenhum logo foi redesenhado: o favicon e os ícones de app aplicam o símbolo oficial, sem alterações, sobre um quadrado Azul Oceano, como no exemplo “Avatar redes sociais / ícone de app” do manual.

Se trocar o favicon, gere de novo os PNGs (`apple-touch-icon.png`, `icon-512.png`, `favicon-32.png`) ou substitua-os em `public/`.

---

## 4. Vídeo da Hero (scroll-scrubbing)

### Como funciona

A Hero da Home é uma seção com scroll estendido e um palco `position: sticky`. O progresso do scroll (0 → 1) é mapeado para o tempo da mídia, nos dois sentidos. A página continua rolando normalmente: **não há scroll hijacking**. Ao final da sequência, a seção seguinte desliza por cima do palco.

O controlador (`src/js/scroll-video.js`):

- suaviza o tempo-alvo com um fator independente de frame rate, mas **limita o atraso** (`maxLagSeconds`), então o vídeo nunca fica atrasado indefinidamente em relação ao scroll;
- mantém **um único seek em andamento** e enfileira apenas o alvo mais recente para o evento `seeked` (sem `currentTime` conflitante);
- ignora seeks redundantes (`seekEpsilon`);
- usa `muted`, `playsinline`, `preload="auto"` e um play/pause inicial para “acordar” o decoder (iOS Safari);
- tem timeout de carregamento e tratamento de erro de mídia;
- inclui uma **sonda de desempenho**: se a mediana dos seeks (somente em trechos já carregados) passar de `probe.slowSeekMs`, rebaixa a estratégia automaticamente;
- só começa a baixar o vídeo **depois do `load` e com a thread ociosa**. O poster cobre a Hero até lá, então o vídeo não disputa banda com recursos críticos.

### Estratégias e cadeia de fallback

Configuradas em `src/js/config.js` → `HERO.strategy`:

| Valor | Comportamento |
|---|---|
| `'auto'` (padrão) | vídeo → sequência de imagens (Canvas) → poster |
| `'video'` | força seeking de `<video>` |
| `'frames'` | força a sequência de imagens em `<canvas>` |
| `'poster'` | imagem estática com leve zoom ligado ao scroll (sem download de mídia) |

Fallbacks automáticos: erro ou timeout do vídeo → frames → poster; seek lento → frames ou poster; conexão com economia de dados ou 2G → poster; **`prefers-reduced-motion` → Hero estática de uma tela, sem mídia baixada e sem scroll estendido**; sem JavaScript → Hero estática. Os três cenários foram testados (seção 9).

### Onde colocar os arquivos

| Caminho | Obrigatório |
|---|---|
| `public/assets/videos/hero-scroll.mp4` | sim (para a estratégia de vídeo) |
| `public/assets/videos/hero-scroll-mobile.mp4` | opcional — versão retrato usada em telas com proporção ≤ 4:5 |
| `public/assets/videos/hero-scroll.webm` | opcional |
| `public/assets/frames/hero/` + `manifest.json` | opcional — estratégia Canvas |
| `public/assets/images/hero-poster.webp` | gerado por `npm run images` a partir de `assets-src/images/hero-poster.jpg` |

### Codificação recomendada (importante)

Vídeo comum, com keyframes espaçados, **não** faz scrubbing fluido: cada seek precisa decodificar a partir do keyframe anterior. Use o script, que já aplica as configurações corretas:

```bash
npm run hero:encode -- caminho/para/video-final.mp4 --start 0 --duration 12 --mobile-x 0.5
npm run images   # regenera o poster responsivo e a og-image
```

O script gera MP4 H.264 (perfil High), **sem áudio**, `+faststart`, **keyframe a cada 8 frames** (`-g 8`, sem B-frames, sem keyframes por corte de cena), 20 fps, 1920 px. Também gera a versão retrato 720×1280 (posição do recorte ajustável em `--mobile-x`, de 0 a 1) e os posters exatamente do primeiro frame, para a troca poster → vídeo ser imperceptível.

Opções úteis: `--crf 26` (mais qualidade e peso), `--width 1600`, `--fps 24`, `--gop 6`, `--webm`, `--frames 104` (exporta a sequência para Canvas), `--frame-width 1280`, `--no-mobile`.

Recomendações para o material definitivo: 8–15 s, movimento de câmera contínuo e lento (drone ou dolly), sem cortes, área calma à esquerda ou embaixo para a headline. Mire em ≤ 6 MB (desktop) e ≤ 4 MB (mobile).

---

## 5. Imagens

1. Coloque o original (JPG, PNG, WebP ou AVIF de alta resolução, ≥ 2400 px de largura) em **`assets-src/images/`**.
2. Rode `npm run images`.
3. O script gera em `public/assets/images/` as larguras 640/1024/1600/2400 em AVIF e WebP, o `manifest.json` (dimensões, cor dominante, LQIP), o `hero-poster.webp`/`.avif` e a `og-image.jpg` (1200×630).

**Para trocar uma imagem**, basta substituir o arquivo mantendo o mesmo nome. Nomes em uso:

| Nome | Onde aparece |
|---|---|
| `hero-poster`, `hero-poster-mobile` | Poster da Hero (gerados pelo `hero:encode`) |
| `category-food-agriculture` · `category-energy-solar` · `category-industrial-supplies` · `category-consumer-goods` | Vitrine da Home, página Products (linhas e preview de hover) |
| `terminal-crane-ship` | Home (Who We Are) e About |
| `containers-overhead` | Home (About), Global Trade, Business |
| `port-night-reflections` | Home (Global Perspective) |
| `port-sunset-cranes` | Hero da página Global Trade |
| `port-dusk-cranes` | Hero da página About |

Para usar uma imagem nova numa página: `<!-- @picture name="nome-do-arquivo" alt="Descrição" sizes="(min-width: 1024px) 50vw, 100vw" -->`. Use `alt=""` em imagens decorativas.

> **Mídias provisórias:** todas as fotos e o vídeo atuais vêm do Wikimedia Commons, sob CC0, domínio público, CC BY 2.0 ou CC BY 3.0. Origem, autor e licença estão em `/credits/`. Letreiros de armadores (Hapag-Lloyd, Maersk, OOCL) foram retocados nos cascos dos navios para não sugerir vínculo com essas empresas; os originais não foram alterados no Commons. Elas ilustram comércio internacional em geral e **não** representam operações da Inter Ocean. Quando as mídias definitivas forem instaladas, revise ou remova a página `/credits/` e o link “Media credits” do rodapé (`partials/footer.html`). Enquanto houver mídia CC BY, o crédito é obrigatório.

---

## 6. Formulário de contato

Campos: Full Name, Company, Business Email, Country (lista ISO com os Estados Unidos primeiro, digitação livre permitida), Type of Inquiry (Product Inquiry · Supplier Proposal · Business Partnership · General Inquiry), Product or Business Interest, Estimated Quantity (opcional) e Message. Há validação client-side com mensagens por campo e um resumo de erros acessível, além de um honeypot anti-spam.

Links contextuais pré-preenchem o formulário: `/contact/?type=supplier&interest=Solar%20panels`.

### Como o envio funciona (Resend → info@interoceanco.com)

```
navegador ──POST JSON──▶ /api/contact/ (função Vercel, api/contact.js) ──▶ API do Resend ──▶ info@interoceanco.com (grupo do Workspace)
```

A função `api/contact.js`:

- valida tudo de novo no servidor (campos obrigatórios, e-mail, tipo de consulta, tamanhos máximos) e remove quebras de linha de campos de uma linha;
- bloqueia requisições vindas de outros sites (verificação de `Origin`), descarta bots pelo honeypot e limita a 5 envios a cada 10 minutos por IP (limite por instância, em melhor esforço);
- envia um e-mail HTML + texto para `CONTACT_TO`, com remetente `CONTACT_FROM` e **`reply_to` = e-mail do visitante**, para que "Responder" no Gmail vá direto ao cliente;
- assunto: `[Website] Product Inquiry — Empresa (Nome)`; usa `Idempotency-Key` para não duplicar o envio se houver nova tentativa;
- respostas: `200` enviado · `400` erros por campo (exibidos no formulário) · `429` excesso de envios · `502` falha no Resend · `503` **não configurado** (sem `RESEND_API_KEY`).

O formulário **nunca finge que enviou**. Sem endpoint ou com resposta `503`, mostra *"Your inquiry has not been sent…"*, preserva os dados e oferece um `mailto:` preenchido para `VITE_CONTACT_EMAIL`.

### Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Valor | Onde é usada |
|---|---|---|
| `RESEND_API_KEY` | chave do Resend (permissão *Sending access*, restrita ao domínio) | servidor — **secreta** |
| `CONTACT_TO` | `info@interoceanco.com` (aceita vários, separados por vírgula) | servidor |
| `CONTACT_FROM` | `Inter Ocean Website <website@interoceanco.com>` | servidor |
| `VITE_FORM_ENDPOINT` | `/api/contact/` | build (navegador) |
| `VITE_CONTACT_EMAIL` | `info@interoceanco.com` | build (navegador) |
| `VITE_SITE_URL` | `https://www.interoceanco.com` | build (canonical, OG, sitemap) |
| `ALLOWED_ORIGINS` | opcional, origens extras permitidas | servidor |

Variáveis novas ou alteradas só valem após um novo deploy (`vercel deploy --prod`).

### Ativação do Resend (checklist)

1. **Domínio no Resend:** *Domains → Add Domain* → `interoceanco.com`. O Resend mostra 3 registros DNS: DKIM `resend._domainkey` (TXT), e no subdomínio `send` um MX e um TXT com SPF. Eles **não alteram** o MX nem o SPF do Google Workspace.
2. **DNS na Cloudflare:** crie os registros exatamente como o Resend mostrar, com o proxy **desligado** (nuvem cinza, "DNS only"). Se o Resend oferecer configuração automática com a Cloudflare, ela faz o mesmo. Depois clique em **Verify** no Resend.
3. **Chave de API:** *API Keys → Create* com permissão **Sending access** e domínio `interoceanco.com`. Grave-a na Vercel como `RESEND_API_KEY` (Production e Preview) e faça um novo deploy.
4. **Grupo info@ no Google Workspace:** em groups.google.com → info@interoceanco.com → *Configurações do grupo* → **Quem pode postar: "Qualquer pessoa na Web"**. O endereço `website@interoceanco.com` não é um usuário do Workspace, e com a opção "Somente membros da organização" o Google recusa a mensagem. Se o Admin Console restringir grupos a membros internos, libere em *Apps → Google Workspace → Groups for Business → "Os proprietários do grupo podem permitir que pessoas de fora da organização enviem mensagens"*. Confira também a moderação de spam do grupo (*Moderação de spam*: "Enviar para o grupo"/"Moderar" conforme preferir).
5. **Recomendado:** um registro DMARC na Cloudflare: `TXT _dmarc` → `v=DMARC1; p=none; rua=mailto:info@interoceanco.com`.
6. **Teste:** envie o formulário em https://www.interoceanco.com/contact/ e confira a caixa do grupo e o painel *Emails* do Resend.

### Desenvolvimento local

`npm run dev` (Vite) não executa a pasta `api/`. Para testar o envio localmente, use `vercel dev` (lê as variáveis com `vercel env pull`). O formulário envia `POST` JSON com: `name, company, email, country, inquiryType, inquiryTypeLabel, interest, quantity, message, page, submittedAt`.

---

## 7. SEO e acessibilidade

- `title`, `description`, canonical e Open Graph por página (em `<!-- @include head … -->` no topo de cada HTML). O domínio vem de `VITE_SITE_URL` (em produção: `https://www.interoceanco.com`, que é o endereço principal; o domínio sem `www` redireciona para ele).
- `sitemap.xml` e `robots.txt` são gerados no build a partir da lista de páginas em `vite.config.js` (`/credits/` e `404` ficam fora, com `noindex`).
- JSON-LD `Organization` na Home, apenas com dados confirmados (nome, Orlando/FL/US).
- Um único H1 por página, hierarquia de headings, landmarks, skip link, foco visível, menu mobile com `role="dialog"`, foco preso, fechamento por Escape, retorno do foco e `inert` no conteúdo de fundo, além de `aria-current` na navegação.
- Contraste verificado com os tokens: botão primário com texto Azul Oceano sobre Tangerina (5,8:1); eyebrows em tom tangerina escuro `#A85300` sobre branco (5,4:1); texto secundário `#4A5B76` (6,9:1). Tangerina pura só aparece como texto sobre fundos escuros.
- `prefers-reduced-motion` desliga todas as animações de scroll, o scrubbing e as transições entre páginas.

---

## 8. Deploy na Vercel

1. Crie um repositório Git com o projeto (`dist/`, `node_modules/` e `.env` já estão no `.gitignore`) e importe-o na Vercel. Também funciona com `npx vercel` na pasta do projeto.
2. A configuração já está em `vercel.json`: build `npm run build`, saída `dist`, `cleanUrls` e `trailingSlash`. Há também cache longo para `/_build/` (arquivos com hash), cache de 1 dia + revalidação para `/assets/` (mídias substituíveis) e headers de segurança.
3. Defina as variáveis `VITE_SITE_URL`, `VITE_FORM_ENDPOINT` e `VITE_CONTACT_EMAIL` conforme necessário. Como as variáveis `VITE_*` entram no build, faça um **novo deploy** sempre que alterá-las.
4. Aponte o domínio `interoceanco.com` em *Settings → Domains*.

Rotas como `/about/` são pastas com `index.html` e funcionam igual no dev, no `preview` e na Vercel. A página `404.html` é servida automaticamente pela Vercel.

---

## 9. Validação realizada

Testes executados com Chrome headless (Playwright) contra o servidor de desenvolvimento e contra o **build de produção** (`vite preview`):

- **Build:** `npm run build` sem erros. 589 referências internas verificadas (links, âncoras `#categoria`, `srcset`), nenhuma quebrada. Nenhuma diretiva ou placeholder sem resolver no HTML final.
- **Console:** nenhum erro em nenhuma página (desktop e mobile).
- **Overflow horizontal:** nenhum em 360, 390, 768, 1024, 1440 e 1920 px, em todas as páginas.
- **Hero:** vídeo responde ao scroll nos dois sentidos (por exemplo, scroll em 140vh ≈ 8,6 s de 13 s). Fallbacks testados: erro de rede no vídeo → Canvas; vídeos ausentes → Canvas; sem vídeo e sem frames → poster com scroll mais curto.
- **Menu mobile:** abre e fecha, foco no botão de fechar, foco preso, Escape fecha, foco volta ao botão, conteúdo de fundo `inert`, página ativa marcada.
- **Teclado:** o primeiro Tab mostra o skip link; o anel de foco aparece na navegação.
- **Formulário:** pré-preenchimento por URL, lista de países, erros por campo + resumo focado, validação de e-mail, estado honesto de “não enviado” sem endpoint, dados preservados.
- **Reduced motion:** sem a classe `.motion`, nenhum download de vídeo, Hero de uma tela, nenhum conteúdo oculto.
- **Lighthouse local** (build de produção, `localhost`, medição local — **não** representa produção; os valores variam entre execuções nesta máquina). Desktop: Home 100/100/100/100 (Performance/Acessibilidade/Boas práticas/SEO), LCP 0,7 s, CLS 0,004. Mobile simulado (4G lento + CPU 4×): Home Performance 76–90, LCP 3,3–4,0 s, CLS 0,02–0,05, TBT 40–380 ms; demais páginas Performance 90–98, LCP 2,3–2,8 s, CLS ≈ 0, TBT 50–190 ms. Acessibilidade 100, Boas práticas 100 e SEO 100 nas páginas medidas após as correções finais.
  As metas de LCP ≤ 2,5 s, CLS < 0,1 e INP ≤ 200 ms devem ser **medidas novamente em produção** (Vercel/CDN), com as mídias definitivas. No mobile, o elemento LCP hoje é o logo PNG; o SVG oficial deve melhorar esse número.

---

## 10. Pendências (dependem de você)

- [ ] Logos oficiais em SVG (`logo-primary.svg`, `logo-negative.svg`) e favicon definitivo.
- [ ] Vídeo definitivo da Hero → `npm run hero:encode` + `npm run images`.
- [ ] Fotografias definitivas em `assets-src/images/` → `npm run images`.
- [ ] Ativar o Resend (seção 6: domínio verificado, `RESEND_API_KEY`, grupo info@ aceitando mensagens externas).
- [ ] Revisar ou remover `/credits/` após trocar as mídias provisórias.
- [ ] Revisão jurídica: política de privacidade / termos, se necessários para o formulário (não foram criados para não inventar informações legais).
- [ ] Revisão do texto das páginas secundárias. A copy aprovada foi usada sem alterações na Home e reaproveitada nas demais páginas; os textos complementares descrevem apenas o posicionamento informado (compra e venda própria, base nos EUA, categorias de interesse), sem números, clientes, certificações ou escritórios.
