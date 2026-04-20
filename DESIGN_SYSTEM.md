# Design System — Padrão Agência Pinguim

> **Como usar este arquivo em outro projeto:**
> 1. Copie este `DESIGN_SYSTEM.md` para a raiz do novo projeto.
> 2. Diga ao Claude: *"Leia o DESIGN_SYSTEM.md e aplique no projeto. Replique cores, tipografia, componentes e padrões de acessibilidade exatamente como descritos."*
> 3. Claude deve ajustar `globals.css`, `layout.tsx`, componentes UI e tokens do Tailwind para bater com este doc.

Este é o design system usado no sistema **CloserFlow / Reunião Estratégica**. Foi validado pelo usuário como "muito bom" — clean, acessível, moderno, com identidade laranja forte.

---

## 1. Stack técnica

- **Framework:** Next.js 16+ (App Router)
- **CSS:** Tailwind CSS v4 (com `@theme inline`, não v3)
- **Componentes:** shadcn/ui v4 + base-ui (`@base-ui/react`)
- **Ícones:** lucide-react
- **Toasts:** sonner (com `richColors`)
- **Fontes:** `next/font/google` — Inter (corpo) + Plus Jakarta Sans (títulos)
- **Utils:** `class-variance-authority` (cva), `clsx`, `tailwind-merge`

---

## 2. Tipografia

### Fontes
| Função | Família | Variável CSS | Uso |
|---|---|---|---|
| Corpo / UI | **Inter** | `--font-inter` → `font-sans` | Texto geral, inputs, labels |
| Títulos / Headings | **Plus Jakarta Sans** | `--font-jakarta` → `font-heading` | `CardTitle`, H1-H3, destaques |
| Mono (opcional) | Geist Mono | `--font-geist-mono` → `font-mono` | Código, IDs |

Configuração em `src/app/layout.tsx`:

```tsx
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });

// <html className={`${inter.variable} ${jakarta.variable} h-full antialiased`}>
```

### Escala e legibilidade (acessibilidade é PRIORIDADE)

- Base do body: **16px** com `line-height: 1.6`
- `-webkit-font-smoothing: antialiased` sempre
- **Placeholders legíveis** — NUNCA cinza claro demais: `#71717A` no claro, `#A1A1AA` no escuro, `opacity: 1`
- Inputs usam `text-base` no mobile e `md:text-sm` no desktop (evita zoom iOS)

---

## 3. Paleta de cores

### Cor primária — Laranja CloserFlow
É a assinatura visual. Usar com confiança em botões, focus rings, destaques.

| Token | Hex | Uso |
|---|---|---|
| `--color-brand-50`  | `#FFF7ED` | Fundo de destaque suave (`accent`) |
| `--color-brand-100` | `#FFEDD5` | Hover de itens de lista |
| `--color-brand-200` | `#FED7AA` | Chips, badges suaves |
| `--color-brand-300` | `#FDBA74` | Gráficos secundários |
| `--color-brand-400` | `#FB923C` | Gráficos |
| **`--color-brand-500`** | **`#E85C00`** | **Primary — botões, links, ring, logo** |
| `--color-brand-600` | `#CC4F00` | Hover do primary |
| `--color-brand-700` | `#A63F00` | Texto de accent no escuro |
| `--color-brand-800` | `#7C2D00` | Texto de accent no claro |
| `--color-brand-900` | `#5C2100` | — |
| `--color-brand-950` | `#3B1500` | Fundo accent no escuro |

### Tema CLARO — Painel admin (fundo branco)

```css
:root {
  --background: #FAFAFA;        /* cinza quase-branco, nunca branco puro */
  --foreground: #121212;        /* preto quase-preto, nunca puro */
  --card: #FFFFFF;
  --card-foreground: #121212;
  --popover: #FFFFFF;
  --popover-foreground: #121212;
  --primary: #E85C00;
  --primary-foreground: #FFFFFF;
  --secondary: #F4F4F5;
  --secondary-foreground: #121212;
  --muted: #F4F4F5;
  --muted-foreground: #52525B;  /* cinza escuro — texto secundário legível */
  --accent: #FFF7ED;            /* laranja bem suave */
  --accent-foreground: #7C2D00;
  --destructive: #EF4444;
  --border: #E4E4E7;
  --input: #E4E4E7;
  --ring: #E85C00;              /* focus ring SEMPRE laranja */
  --success: #22C55E;
  --success-foreground: #FFFFFF;
  --warning: #EAB308;
  --warning-foreground: #121212;
  --radius: 0.625rem;           /* 10px — base do sistema de raios */
  /* Sidebar herda do tema */
  --sidebar: #FFFFFF;
  --sidebar-foreground: #121212;
  --sidebar-primary: #E85C00;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #FFF7ED;
  --sidebar-accent-foreground: #7C2D00;
  --sidebar-border: #E4E4E7;
  --sidebar-ring: #E85C00;
}
```

### Tema ESCURO — Páginas públicas / marketing (fundo preto)

```css
.dark {
  --background: #121212;
  --foreground: #FAFAFA;
  --card: #1A1A1A;
  --card-foreground: #FAFAFA;
  --popover: #1A1A1A;
  --popover-foreground: #FAFAFA;
  --primary: #E85C00;           /* primary não muda — é a identidade */
  --primary-foreground: #FFFFFF;
  --secondary: #262626;
  --secondary-foreground: #FAFAFA;
  --muted: #262626;
  --muted-foreground: #A1A1AA;
  --accent: #3B1500;            /* brand-950 como fundo de destaque */
  --accent-foreground: #FED7AA; /* brand-200 como texto */
  --destructive: #EF4444;
  --border: #3F3F46;
  --input: #3F3F46;
  --ring: #E85C00;
  /* Sidebar dark */
  --sidebar: #1A1A1A;
  --sidebar-foreground: #FAFAFA;
  --sidebar-primary: #E85C00;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #262626;
  --sidebar-accent-foreground: #FAFAFA;
  --sidebar-border: #3F3F46;
  --sidebar-ring: #E85C00;
}
```

### Gráficos (charts)
`--chart-1` a `--chart-5` usam a escala brand inteira — gradiente natural do laranja:
```
#E85C00 → #FB923C → #FDBA74 → #FED7AA → #FFF7ED
```

---

## 4. Sistema de raios (border-radius)

Base: `--radius: 0.625rem` (10px). Tudo escala a partir dela:

| Token | Fórmula | Valor | Uso |
|---|---|---|---|
| `--radius-sm` | `calc(var(--radius) * 0.6)` | ~6px | Badges pequenos |
| `--radius-md` | `calc(var(--radius) * 0.8)` | ~8px | Inputs, botões pequenos |
| `--radius-lg` | `var(--radius)` | 10px | **Botões e inputs default** |
| `--radius-xl` | `calc(var(--radius) * 1.4)` | ~14px | Cards (`rounded-xl`) |
| `--radius-2xl` | `calc(var(--radius) * 1.8)` | ~18px | Modais grandes |
| `--radius-3xl` | `calc(var(--radius) * 2.2)` | ~22px | Hero sections |
| `--radius-4xl` | `calc(var(--radius) * 2.6)` | ~26px | — |

Elementos circulares (avatar, dia selecionado no calendário): `rounded-full` / `border-radius: 9999px`.

---

## 5. Componentes — padrões visuais

### Button (`src/components/ui/button.tsx`)

- **Base:** `rounded-lg` (10px), `text-sm font-medium`, `transition-all`
- **Feedback tátil:** `active:translate-y-px` (empurra para baixo no click)
- **Focus visível:** `ring-3 ring-ring/50` (laranja semi-transparente)
- **Validação:** `aria-invalid:ring-3 aria-invalid:ring-destructive/20`

**Variantes:** `default` (laranja), `outline`, `secondary`, `ghost`, `destructive` (vermelho suave, não chapado), `link`.

**Tamanhos:** `xs` (h-6), `sm` (h-7), `default` (h-8), `lg` (h-9), `icon` e variantes.

**Destructive é sempre vermelho suave** — `bg-destructive/10 text-destructive`, nunca chapado. Delete nunca grita.

### Card (`src/components/ui/card.tsx`)

- `rounded-xl` (~14px), `bg-card`, `ring-1 ring-foreground/10` (borda sutil, não `border` chapado)
- Gap interno padrão: `gap-4`, padding `py-4 px-4`
- Variante `size="sm"`: gap-3, py-3, px-3
- `CardTitle` usa `font-heading` (Jakarta) em `text-base font-medium leading-snug`
- `CardDescription` usa `text-sm text-muted-foreground`
- `CardFooter` tem `border-t bg-muted/50` — footer visualmente destacado

### Input (`src/components/ui/input.tsx`)

- `h-8`, `rounded-lg`, `border border-input`, `bg-transparent`
- Focus: `ring-3 ring-ring/50` (laranja)
- Texto `text-base md:text-sm` (anti-zoom iOS)
- Disabled: `bg-input/50 opacity-50 cursor-not-allowed`

### Toaster (sonner)

```tsx
<Toaster
  richColors
  position="top-right"
  toastOptions={{
    style: {
      background: "white",
      color: "#121212",
      border: "1px solid #E4E4E7",
      fontSize: "0.9rem",
    },
  }}
/>
```

---

## 6. Calendário (quando aplicável)

Estilização específica em `.public-calendar` usando data-attributes do react-day-picker v9. Padrão: dia selecionado e dia "hoje" ficam em círculo laranja (`rounded-full`, `bg-primary`), dias disponíveis futuros em laranja sem fundo (destaque por cor), dias desabilitados em cinza neutro (`#71717A`), hover suave em `#FFF7ED` (brand-50).

Variável CSS `--pc` permite personalizar a cor primária por empresa (white-label): `style={{ '--pc': empresa.cor_primaria }}`.

---

## 7. globals.css — arquivo completo

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-inter);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-jakarta);

  /* ... (todas as vars do shadcn, já mapeadas acima) ... */

  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);

  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);

  /* Brand colors — paleta laranja (ver seção 3) */
  --color-brand-50:  #FFF7ED;
  --color-brand-100: #FFEDD5;
  --color-brand-200: #FED7AA;
  --color-brand-300: #FDBA74;
  --color-brand-400: #FB923C;
  --color-brand-500: #E85C00;
  --color-brand-600: #CC4F00;
  --color-brand-700: #A63F00;
  --color-brand-800: #7C2D00;
  --color-brand-900: #5C2100;
  --color-brand-950: #3B1500;
}

:root { /* tema claro — ver seção 3 */ }
.dark { /* tema escuro — ver seção 3 */ }

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
  html { @apply font-sans; }

  /* Acessibilidade: fontes mínimas para legibilidade */
  body {
    font-size: 16px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Placeholders legíveis - NUNCA cinza claro demais */
  input::placeholder, textarea::placeholder {
    color: #71717A;
    opacity: 1;
  }
  .dark input::placeholder, .dark textarea::placeholder {
    color: #A1A1AA;
    opacity: 1;
  }
}
```

---

## 8. Princípios de design (regras de ouro)

1. **Acessibilidade primeiro.** Fontes de 16px base. Placeholders `#71717A` (nunca cinza claro). Contraste AA mínimo. Testar com pessoas de perfis diferentes.
2. **Laranja é identidade.** `#E85C00` no primary, no ring, no focus. Não diluir, não trocar em "modos escuros".
3. **Nada chapado.** Preto é `#121212`. Branco de fundo é `#FAFAFA`. Destructive é `/10` de opacidade, não sólido. Cards têm `ring-1 ring-foreground/10`, não `border` cheio.
4. **Feedback tátil em tudo que é clicável.** `active:translate-y-px` em botões. Hover sempre presente. Focus ring de 3px, sempre laranja.
5. **Títulos em Jakarta, corpo em Inter.** Duas fontes, nunca três.
6. **Raios consistentes.** Tudo escala de `--radius: 10px`. Cards `rounded-xl`, botões `rounded-lg`.
7. **Tokens semânticos, não hex.** No código use `bg-primary`, `text-muted-foreground`, `border-border` — nunca hex direto. Isso garante troca de tema.
8. **White-label-ready.** Se o sistema tem múltiplos clientes, exponha `--pc` (primary color) como CSS var inline para override por tenant, mantendo o resto do design idêntico.

---

## 9. Checklist para replicar em novo projeto

Quando aplicar este design system em um projeto novo, garantir:

- [ ] `package.json` com as deps da seção 1 (next 16+, tailwind v4, shadcn v4, base-ui, sonner, lucide-react, CVA)
- [ ] `src/app/layout.tsx` importando Inter + Plus Jakarta Sans via `next/font/google`
- [ ] `src/app/globals.css` com `@theme inline`, paleta brand, `:root` claro, `.dark` escuro, `@layer base` com acessibilidade
- [ ] Variáveis de focus: `--ring: #E85C00` em ambos os temas
- [ ] Toaster sonner configurado com `richColors` e fundo branco
- [ ] Componentes shadcn instalados: `button`, `input`, `card`, `dialog`, `dropdown-menu`, `select`, `tabs`, `badge`, `separator`, `sonner`, `tooltip`, `label`, `checkbox`, `switch`
- [ ] `cn()` utility em `src/lib/utils.ts` (clsx + tailwind-merge)
- [ ] Placeholders nunca mais claros que `#71717A`
- [ ] Teste manual: tab pelos inputs — focus ring deve aparecer laranja e bem visível
