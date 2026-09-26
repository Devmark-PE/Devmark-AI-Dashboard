# Guía: Conocimiento (RAG) y Herramientas

Cómo darle información a la IA de DEVMARK. Hay dos caminos y se pueden usar juntos en la misma aplicación:

| | **Conocimiento (RAG)** | **Herramientas (Tools)** |
|---|---|---|
| Para qué | Información **fija o que cambia poco** | Datos **vivos** que cambian a diario |
| Ejemplos | Preguntas frecuentes, precios, horarios, políticas, manuales | Leads, pedidos, stock, promociones del día |
| Dónde vive la información | Copia dentro de DEVMARK (documentos subidos) | En tu sistema: se consulta en el momento |
| Se configura en | Dashboard → *Conocimiento (RAG)* | Dashboard → *Herramientas* |

---

## 1. Conocimiento (RAG)

### Cómo funciona
1. Subes un documento a una **aplicación**.
2. Se divide en **fragmentos de ~700 caracteres** (respetando párrafos) y se indexa con búsqueda de texto completo en español.
3. En cada pregunta se buscan los fragmentos con **las mismas palabras** (ignora acentos y reconoce variaciones:
   «ubicación» encuentra «ubicados») y se le pasan a la IA con la instrucción de no inventar y citar la fuente.

### Qué formato usar

| Formato | Calidad | Nota |
|---|---|---|
| **.md (Markdown)** | ⭐⭐⭐ | El mejor: texto limpio con títulos, fácil de mantener |
| **Texto pegado** | ⭐⭐⭐ | Igual de bueno; ideal para información corta |
| **.txt** | ⭐⭐ | Limpio, pero sin títulos |
| **.pdf** | ⭐ | Puede mezclar columnas y perder tablas. Si es escaneado (imagen), no se lee nada |

Word y Excel todavía no se aceptan: guárdalos como PDF o copia el texto a un `.md`.

### Cómo escribirlo
1. **Un tema por párrafo**, que se entienda solo (sin «como dije arriba»).
2. **Repite el tema**: «El precio de la limpieza dental es S/ 120», no solo «Cuesta S/ 120».
3. **Usa las palabras de tus clientes**, con sinónimos: «horario de atención (hora de apertura, a qué hora abren)».
4. **Pregunta y respuesta**: empezar el párrafo con la pregunta típica ayuda a encontrarlo.
5. **Tablas como frases**: una línea por fila («Plan Básico: S/ 50 al mes, incluye 1 usuario»).
6. **Varios documentos cortos** (Horarios, Precios, Servicios…) mejor que uno gigante.

### Plantilla

```markdown
# Preguntas frecuentes - Mi Empresa

## Horario de atención
¿A qué hora abren? El horario de atención de Mi Empresa es de lunes a viernes
de 9:00 a 18:00 y sábados de 9:00 a 13:00. Domingos y feriados no atendemos.

## Precios de los servicios
¿Cuánto cuesta una página web? El precio de una página web básica es desde S/ 1 500.
Una tienda online (e-commerce) cuesta desde S/ 3 500. Los precios incluyen IGV.

## Ubicación y contacto
¿Dónde están ubicados? Mi Empresa está en Lima, Perú. Escríbenos a contacto@miempresa.com.
```

(También se puede descargar desde *Conocimiento (RAG)* → «Cómo preparar tus documentos».)

### Pasos
1. *Conocimiento (RAG)* → elige la aplicación → **Añadir documento**.
2. **Probar búsqueda** con preguntas reales: el fragmento correcto debe salir primero.
3. **Activar RAG** en la aplicación: desde ese momento sus API keys lo usan automáticamente.
4. Compruébalo en el **Playground** con «Usar documentos de la aplicación».

Desde la API: `"rag": false` lo desactiva en una petición y `"rag": true` lo fuerza. La respuesta trae `rag.sources`.

---

## 2. Herramientas (Tools)

### Cómo funciona

```
1. Pregunta          Tu app envía: «¿De dónde es el lead Ana?» (con su API key, como siempre)
       │
2. La IA elige       Ve las herramientas de esa aplicación (nombre + descripción + parámetros)
       │             y decide llamar:  buscar_lead(nombre="Ana")
       │
3. El servidor       DEVMARK arma la URL con el parámetro, añade la credencial cifrada y llama
   consulta          a tu API (ej. Supabase). La IA nunca ve la URL ni la key.
       │
4. Responde          El resultado vuelve a la IA, que redacta: «Ana Pérez es de Lima, estado: nuevo».
```

Máximo 3 rondas de herramientas por pregunta. La respuesta de la API incluye `tools.calls` (qué herramienta se usó,
con qué argumentos, si funcionó y cuánto tardó).

### Tipos
- **API (JSON)**: GET o POST a una URL. Ej.: la API REST de otra Supabase, tu ERP, tu backend.
- **Página web**: lee el texto de una página en el momento (promociones, horarios publicados).

### Ejemplo: leads en otra Supabase

| Campo | Valor |
|---|---|
| Nombre | `buscar_lead` |
| Descripción | Busca leads por nombre. Devuelve ciudad, estado y teléfono. |
| URL | `https://TU-PROYECTO.supabase.co/rest/v1/leads?select=nombre,ciudad,estado,telefono&nombre=ilike.*{nombre}*&ciudad=eq.{ciudad}&limit=5` |
| Parámetros | `nombre` (texto, obligatorio) · `ciudad` (texto, opcional) |
| Cabecera | `apikey` = key publishable/anon del proyecto (se guarda cifrada) |

- `{nombre}` se reemplaza por lo que diga la IA (codificado para URL).
- Si un parámetro **opcional** no llega, su filtro se quita solo (`&ciudad=eq.{ciudad}` desaparece).
- Filtros útiles de Supabase: `eq.` (igual), `ilike.*texto*` (contiene), `gte.` / `lte.` (mayor/menor o igual),
  `order=created_at.desc`, `limit=5`.
- En esa tabla, crea una **política RLS que solo permita `select`**: así la herramienta puede leer pero nunca modificar.

### Consejos
- Nombre y descripción claros: el modelo decide solo con eso.
- **2–3 herramientas por aplicación** como máximo: el modelo actual (1B) es pequeño.
- Pide solo las columnas necesarias y limita resultados: respuestas más rápidas.
- Usa **Probar** antes de asignarla y luego el **Playground** («Usar herramientas»).

### Seguridad
- La IA solo rellena parámetros declarados: no cambia la URL, no ve credenciales, no escribe SQL.
- Las cabeceras se guardan cifradas y el dashboard nunca las vuelve a mostrar.
- No puede llamar a direcciones internas (Ollama, base de datos, metadata de AWS): se valida en cada petición y redirección.
- Límites: 10 s por llamada, 1 MB de respuesta, resultado recortado al máximo de caracteres configurado.

### Desde la API
- Automático para las keys de aplicaciones con herramientas; `"server_tools": false` las desactiva por petición.
- También acepta `tools` en formato OpenAI (function calling del cliente): la respuesta trae `tool_calls` y tu app ejecuta la función.
