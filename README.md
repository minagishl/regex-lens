# Regex Lens

Visualize regular expressions with color-coded tokens and hover explanations.

Edit a pattern, see each fragment colored by its role, hover for what it does, and paste sample text to watch matches light up.

## Features

- Live pattern editing with undo / redo
- Token colors by role (groups, escapes, quantifiers, …)
- Hover tooltips that explain each fragment
- Sample text with highlighted matches
- Flag toggles (`g`, `i`, `m`, `s`)

## Develop

```bash
npm install
npm run dev
```

## Scripts

| Command           | Description                             |
| ----------------- | --------------------------------------- |
| `npm run dev`     | Start the Vite dev server               |
| `npm run build`   | Type-check and build for production     |
| `npm run preview` | Preview the production build            |
| `npm run lint`    | Run ESLint                              |
| `npm run format`  | Format with Prettier                    |
| `npm run ogp`     | Regenerate `public/ogp.png` with Satori |

## License

[MIT](LICENSE)
