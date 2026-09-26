/** Contenido de las guías de RAG y Herramientas (se usa en Conocimiento, Herramientas y Documentación). */

export const RAG_FORMATS: { format: string; rating: 1 | 2 | 3; note: string }[] = [
  { format: ".md (Markdown)", rating: 3, note: "Texto limpio con títulos. El mejor: fácil de mantener y actualizar." },
  { format: "Texto pegado", rating: 3, note: "Igual de bueno que .md; ideal para información corta." },
  { format: ".txt", rating: 2, note: "Limpio, pero sin títulos que separen los temas." },
  { format: ".pdf", rating: 1, note: "Puede mezclar columnas y perder tablas. Si es escaneado (imagen), no se lee." },
];

export const RAG_TIPS: { title: string; text: string }[] = [
  { title: "Un tema por párrafo", text: "Cada párrafo debe entenderse solo, sin «como dije arriba». Se guardan en fragmentos de ~700 caracteres." },
  { title: "Repite el tema", text: "«El precio de la limpieza dental es S/ 120», no solo «Cuesta S/ 120»." },
  { title: "Palabras de tus clientes", text: "La búsqueda es por palabras: incluye sinónimos (horario, hora de apertura, a qué hora abren)." },
  { title: "Pregunta y respuesta", text: "Empezar el párrafo con la pregunta típica ayuda mucho a encontrarlo." },
  { title: "Tablas como frases", text: "Una línea por fila: «Plan Básico: S/ 50 al mes, incluye 1 usuario»." },
  { title: "Varios documentos cortos", text: "Horarios, Precios, Servicios, Políticas… mejor que uno gigante: las fuentes citadas son más claras." },
];

export const RAG_TEMPLATE = `# Preguntas frecuentes - Mi Empresa

## Horario de atención
¿A qué hora abren? El horario de atención de Mi Empresa es de lunes a viernes
de 9:00 a 18:00 y sábados de 9:00 a 13:00. Domingos y feriados no atendemos.

## Precios de los servicios
¿Cuánto cuesta una página web? El precio de una página web básica es desde S/ 1 500.
Una tienda online (e-commerce) cuesta desde S/ 3 500. Los precios incluyen IGV.

## Formas de pago
¿Cómo puedo pagar? Aceptamos transferencia bancaria, Yape, Plin y tarjeta de crédito.

## Ubicación y contacto
¿Dónde están ubicados? Mi Empresa está en Lima, Perú. Escríbenos a contacto@miempresa.com
o al WhatsApp +51 999 999 999.
`;

export const TOOL_STEPS: { title: string; text: string }[] = [
  { title: "Pregunta", text: "Tu app envía la pregunta con su API key, como siempre: «¿De dónde es el lead Ana?»." },
  { title: "La IA elige", text: "El modelo ve el nombre, la descripción y los parámetros de las herramientas de esa aplicación, y decide llamar a buscar_lead(nombre=\"Ana\")." },
  { title: "El servidor consulta", text: "DEVMARK arma la URL con el parámetro, añade la credencial cifrada y llama a tu API (por ejemplo Supabase). La IA nunca ve la URL ni la key." },
  { title: "Responde con el dato", text: "El resultado (recortado) vuelve al modelo, que redacta la respuesta: «Ana Pérez es de Lima». Máximo 3 rondas." },
];

export const TOOL_TIPS: string[] = [
  "Nombre y descripción claros: el modelo decide solo con eso («Busca leads por nombre; devuelve ciudad, estado y teléfono»).",
  "Pocas herramientas por aplicación (2–3): el modelo actual es pequeño y se confunde con muchas.",
  "Pide solo las columnas necesarias (select=…) y limita resultados (limit=5): respuestas más rápidas y precisas.",
  "Para Supabase usa la key publishable/anon y una política RLS de solo lectura en la tabla.",
  "Prueba siempre con «Probar» antes de asignarla a una aplicación, y luego en el Playground.",
];

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
