export type Theme = "dark" | "light";
const KEY = "devmark-theme";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* modo privado: el tema no se recuerda */
  }
}

/** Script en línea que aplica el tema antes de pintar (evita el parpadeo). */
export const themeInitScript = `try{if(localStorage.getItem("${KEY}")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;
