// Datos editables de la página en un solo lugar.

export const SITE_URL = "https://ai.devmarkpe.com";
export const API_BASE_URL = `${SITE_URL}/v1`;
export const LLMS_URL = `${SITE_URL}/llms.txt`;
export const DASHBOARD_URL = "/dashboard/";

/** Presentación interactiva (aún por publicar): cambiar aquí cuando esté online. */
export const PRESENTATION_URL = "https://devmarkpe.com/presentaciones/devmark-ai";

// Mismo número y patrón de enlace que la web principal (Devmark-Web, src/lib/contact.ts).
export const WHATSAPP_NUMBER = "51975646074";
export const EMAIL = "contacto@devmarkpe.com";
export const HOURS = "Lunes a viernes, 9:00 a 18:00 (hora de Lima)";
export const WHATSAPP_MESSAGE = "Hola DEVMARK, quiero conocer DEVMARK AI, la plataforma privada de IA, para mi empresa.";

export function whatsappHref(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const CTA_HREF = whatsappHref(WHATSAPP_MESSAGE);
export const CTA_LABEL = "Hablar con un asesor";
