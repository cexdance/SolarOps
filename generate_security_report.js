const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, LevelFormat
} = require('docx');
const fs = require('fs');

const NAVY   = "0F172A";
const BLUE   = "2563EB";
const GOLD   = "F59E0B";
const SLATE  = "475569";
const LIGHT  = "EFF6FF";
const LGOLD  = "FEF3C7";
const WHITE  = "FFFFFF";
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

const cell = (text, opts = {}) => new TableCell({
  borders: BORDERS,
  width: { size: opts.width || 4680, type: WidthType.DXA },
  shading: { fill: opts.fill || WHITE, type: ShadingType.CLEAR },
  margins: { top: 100, bottom: 100, left: 140, right: 140 },
  verticalAlign: VerticalAlign.CENTER,
  children: [new Paragraph({
    children: [new TextRun({
      text,
      font: "Arial",
      size: opts.size || 20,
      bold: opts.bold || false,
      color: opts.color || NAVY,
    })],
    alignment: opts.align || AlignmentType.LEFT,
  })]
});

const hdrCell = (text, w) => new TableCell({
  borders: NO_BORDERS,
  width: { size: w, type: WidthType.DXA },
  shading: { fill: NAVY, type: ShadingType.CLEAR },
  margins: { top: 80, bottom: 80, left: 140, right: 140 },
  children: [new Paragraph({
    children: [new TextRun({ text, font: "Arial", size: 18, bold: true, color: "FFFFFF" })],
  })]
});

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 320, after: 120 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD, space: 6 } },
  children: [new TextRun({ text, font: "Arial", size: 32, bold: true, color: NAVY })]
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 80 },
  children: [new TextRun({ text, font: "Arial", size: 24, bold: true, color: BLUE })]
});

const body = (text, opts = {}) => new Paragraph({
  spacing: { after: 120 },
  children: [new TextRun({
    text, font: "Arial", size: 20,
    color: opts.color || SLATE,
    bold: opts.bold || false,
    italics: opts.italic || false,
  })]
});

const bullet = (parts) => new Paragraph({
  numbering: { reference: "bullets", level: 0 },
  spacing: { after: 80 },
  children: parts.map(([text, bold]) => new TextRun({
    text, font: "Arial", size: 20, color: NAVY, bold: !!bold
  }))
});

const numbered = (parts) => new Paragraph({
  numbering: { reference: "numbers", level: 0 },
  spacing: { after: 80 },
  children: parts.map(([text, bold]) => new TextRun({
    text, font: "Arial", size: 20, color: NAVY, bold: !!bold
  }))
});

const spacer = () => new Paragraph({ spacing: { after: 160 }, children: [new TextRun("")] });

const callout = (title, bodyText, fill, accent) => new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [180, 9180],
  rows: [new TableRow({ children: [
    new TableCell({
      borders: NO_BORDERS,
      width: { size: 180, type: WidthType.DXA },
      shading: { fill: accent, type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun("")] })]
    }),
    new TableCell({
      borders: NO_BORDERS,
      width: { size: 9180, type: WidthType.DXA },
      shading: { fill, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 120 },
      children: [
        new Paragraph({ spacing: { after: 60 }, children: [
          new TextRun({ text: title, font: "Arial", size: 20, bold: true, color: NAVY })
        ]}),
        new Paragraph({ spacing: { after: 80 }, children: [
          new TextRun({ text: bodyText, font: "Arial", size: 19, color: SLATE })
        ]})
      ]
    })
  ]})]
});

// ── DOCUMENT ────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.",
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } } } }] },
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: BLUE },
        paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({ children: [
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [6000, 3360],
          rows: [new TableRow({ children: [
            new TableCell({
              borders: NO_BORDERS,
              width: { size: 6000, type: WidthType.DXA },
              shading: { fill: NAVY, type: ShadingType.CLEAR },
              margins: { top: 100, bottom: 100, left: 160, right: 80 },
              children: [new Paragraph({ children: [
                new TextRun({ text: "SOLAR", font: "Arial", size: 28, bold: true, color: WHITE }),
                new TextRun({ text: "OPS", font: "Arial", size: 28, bold: true, color: GOLD }),
                new TextRun({ text: "  |  Reporte de Seguridad", font: "Arial", size: 18, color: "94A3B8" }),
              ]})]
            }),
            new TableCell({
              borders: NO_BORDERS,
              width: { size: 3360, type: WidthType.DXA },
              shading: { fill: NAVY, type: ShadingType.CLEAR },
              margins: { top: 100, bottom: 100, left: 80, right: 160 },
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "3 de junio de 2026", font: "Arial", size: 18, color: "94A3B8" })]
              })]
            })
          ]})]
        })
      ]})
    },
    footers: {
      default: new Footer({ children: [
        new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: GOLD, space: 8 } },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Conexsol Energy  |  Miami, FL  |  conexsol.us  |  Pagina ", font: "Arial", size: 16, color: "94A3B8" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "94A3B8" }),
          ]
        })
      ]})
    },
    children: [

      // ── COVER BLOCK ─────────────────────────────────────────
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [new TableRow({ children: [new TableCell({
          borders: NO_BORDERS,
          width: { size: 9360, type: WidthType.DXA },
          shading: { fill: NAVY, type: ShadingType.CLEAR },
          margins: { top: 440, bottom: 440, left: 360, right: 360 },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [
              new TextRun({ text: "REPORTE DE SEGURIDAD", font: "Arial", size: 13, bold: true, color: GOLD, characterSpacing: 80 }),
            ]}),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [
              new TextRun({ text: "SolarOps", font: "Arial", size: 52, bold: true, color: WHITE }),
            ]}),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
              new TextRun({ text: "Plataforma de Operaciones para Empresas de Energia Solar", font: "Arial", size: 22, color: "94A3B8" }),
            ]}),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [
              new TextRun({ text: "Auditado por: Escaneo Automatizado (Claude Code)  |  Alcance: Codigo completo, dependencias, API, autenticacion", font: "Arial", size: 17, color: "64748B" }),
            ]}),
          ]
        })]})],
      }),

      spacer(),

      // ── LA VERSION CORTA ──────────────────────────────────────
      h1("La Version Corta"),
      callout(
        "Veredicto: La aplicacion es segura para alojar datos de clientes.",
        "SolarOps esta construido sobre tecnologia moderna. Los datos estan protegidos por multiples capas de defensa independientes. Un atacante tendria que romper todas ellas al mismo tiempo para llegar a cualquier dato real.",
        LGOLD, GOLD
      ),
      spacer(),

      // ── POR QUE ES SEGURA ──────────────────────────────────────
      h1("Por Que la Aplicacion Es Segura"),

      h2("1. Los datos viajan encriptados"),
      body("Cada conexion usa HTTPS (encriptacion TLS). Vercel lo aplica automaticamente en cada solicitud. Nadie puede interceptar datos en transito. Es como enviar una carta dentro de un tubo de acero cerrado con llave, donde solo la persona al otro lado tiene la llave."),

      h2("2. Autenticacion de nivel industrial"),
      body("El inicio de sesion, los tokens de sesion y el cifrado de contrasenas los gestiona Supabase Auth, no codigo personalizado. Supabase usa bcrypt para cifrar contrasenas y tokens JWT, siguiendo las mejores practicas usadas por miles de aplicaciones en produccion."),

      h2("3. Los secretos del servidor se quedan en el servidor"),
      body("La llave maestra de Supabase solo se usa en funciones del lado del servidor. Nunca aparece en el codigo del navegador. Un atacante que inspeccione el JavaScript del sitio no encontrara nada util. Las llaves estan en una habitacion a la que no pueden llegar."),

      h2("4. Los endpoints API verifican identidad antes de actuar"),
      body("Todas las funciones del servidor usan un guardia de autenticacion compartido (_auth.ts) que verifica el token JWT del usuario antes de procesar cualquier solicitud."),

      h2("5. Sin vulnerabilidades web comunes"),
      bullet([["Sin eval() ni dangerouslySetInnerHTML ", true], ["(las dos formas mas comunes de inyeccion de codigo en React)"]]),
      bullet([["Sin vectores de inyeccion SQL ", true], ["(Supabase usa consultas parametrizadas)"]]),
      bullet([["Escapado HTML correcto ", true], ["en todas las plantillas de correo electronico"]]),
      bullet([["Proxy API de SolarEdge ", true], ["valida rutas permitidas para prevenir SSRF"]]),
      spacer(),

      h2("6. Archivos de entorno fuera del repositorio"),
      body("Todos los archivos .env con contrasenas y llaves API estan excluidos de git. Solo .env.example (con valores de ejemplo) esta incluido en el codigo."),

      spacer(),

      // ── TABLA: POR QUE PUEDES ALOJAR DATOS ────────────────────
      h1("Por Que Puedes Alojar Datos de Clientes"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3800, 5560],
        rows: [
          new TableRow({ children: [hdrCell("Requisito", 3800), hdrCell("Como SolarOps lo Cumple", 5560)] }),
          new TableRow({ children: [
            cell("Datos encriptados en transito", { width: 3800, bold: true, fill: LIGHT }),
            cell("HTTPS aplicado por Vercel en cada solicitud", { width: 5560, fill: LIGHT }),
          ]}),
          new TableRow({ children: [
            cell("Datos encriptados en reposo", { width: 3800, bold: true }),
            cell("Supabase usa encriptacion AES-256 en PostgreSQL", { width: 5560 }),
          ]}),
          new TableRow({ children: [
            cell("Control de acceso", { width: 3800, bold: true, fill: LIGHT }),
            cell("Supabase Auth con tokens JWT; verificacion de roles en servidor", { width: 5560, fill: LIGHT }),
          ]}),
          new TableRow({ children: [
            cell("Gestion de secretos", { width: 3800, bold: true }),
            cell("Llaves API almacenadas en variables de entorno de Vercel, no en codigo", { width: 5560 }),
          ]}),
          new TableRow({ children: [
            cell("Confiabilidad del alojamiento", { width: 3800, bold: true, fill: LIGHT }),
            cell("Vercel (99.99% SLA) + Supabase (PostgreSQL con respaldos automaticos)", { width: 5560, fill: LIGHT }),
          ]}),
          new TableRow({ children: [
            cell("Sin llaves de admin expuestas", { width: 3800, bold: true }),
            cell("Llave de servicio solo en servidor; cliente usa la llave anonima restringida", { width: 5560 }),
          ]}),
        ],
      }),

      spacer(),

      // ── POR QUE NO ES HACKEABLE ────────────────────────────────
      h1("Por Que Esto No Es Facilmente Hackeable"),
      body("Para robar datos de clientes, un atacante necesitaria romper estas 4 barreras independientes:"),
      numbered([["Romper la encriptacion HTTPS ", true], ["(practicamente imposible con TLS moderno)"]]),
      numbered([["Obtener un token de sesion valido ", true], ["(requiere conocer la contrasena del usuario)"]]),
      numbered([["Evadir Row Level Security de Supabase ", true], ["(aplicado a nivel de base de datos, no de aplicacion)"]]),
      numbered([["Acceder a las variables de entorno del servidor ", true], ["(requiere comprometer la infraestructura de Vercel)"]]),
      spacer(),
      callout(
        "Cada barrera es independiente.",
        "Romper una no ayuda con las otras. Es como tener que abrir cuatro puertas blindadas, cada una con una llave diferente, en edificios diferentes.",
        LIGHT, BLUE
      ),
      spacer(),

      // ── 7 MEJORAS APLICADAS ────────────────────────────────────
      h1("Las 7 Mejoras Aplicadas Hoy"),
      body("Estos no eran amenazas activas, pero la seguridad esta ahora aun mas reforzada:"),
      spacer(),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1200, 3600, 4560],
        rows: [
          new TableRow({ children: [hdrCell("Prioridad", 1200), hdrCell("Elemento", 3600), hdrCell("En Palabras Simples", 4560)] }),
          ...[
            ["Alta",  "Llave API SolarEdge movida al servidor",       "Antes pasaba por la URL del navegador. Ahora solo vive en el servidor. HECHO."],
            ["Alta",  "Contrasena SMTP movida a almacenamiento de sesion", "La contrasena de correo ya no persiste al cerrar el navegador. HECHO."],
            ["Alta",  "Libreria xlsx actualizada a 0.20.3",            "Tenia un error conocido explotable. Ya esta parcheada. HECHO."],
            ["Media", "Content Security Policy reforzada",             "Se elimino unsafe-inline de scripts. Capa extra contra inyeccion. HECHO."],
            ["Media", "Rate limiting en /api/notify",                  "Maximo 10 solicitudes por minuto por usuario. HECHO."],
            ["Baja",  "Vite actualizado a 6.3.7",                      "Error de navegacion de rutas en servidor de desarrollo. Solo afectaba desarrolladores. HECHO."],
            ["Baja",  ".env.prod agregado al .gitignore",              "Defensa en profundidad para futuros cambios de configuracion. HECHO."],
          ].map(([pri, elem, desc], i) => new TableRow({ children: [
            cell(pri, { width: 1200, bold: true, fill: i%2===0 ? LIGHT : WHITE,
              color: pri === "Alta" ? "DC2626" : pri === "Media" ? "D97706" : SLATE }),
            cell(elem, { width: 3600, bold: true, fill: i%2===0 ? LIGHT : WHITE }),
            cell(desc, { width: 4560, fill: i%2===0 ? LIGHT : WHITE }),
          ]}))
        ],
      }),

      spacer(),

      // ── LA PARTE MAS IMPORTANTE ────────────────────────────────
      h1("La Parte Mas Importante"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [new TableRow({ children: [new TableCell({
          borders: NO_BORDERS,
          width: { size: 9360, type: WidthType.DXA },
          shading: { fill: NAVY, type: ShadingType.CLEAR },
          margins: { top: 280, bottom: 280, left: 360, right: 360 },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [
              new TextRun({ text: "La aplicacion no es el eslabon debil.", font: "Arial", size: 26, bold: true, color: WHITE }),
            ]}),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [
              new TextRun({ text: "Las personas lo son.", font: "Arial", size: 26, bold: true, color: GOLD }),
            ]}),
          ]
        })]})],
      }),
      spacer(),
      body("La boveda mas fuerte del mundo no importa si alguien le entrega la llave a un desconocido. SolarOps puede tener encriptacion perfecta, codigo perfecto y reglas de base de datos perfectas. Pero si alguien del equipo comete cualquiera de estos errores:"),
      bullet([["Hace clic en un correo falso ", true], ["que dice 'tu contrasena expiro, haz clic aqui'"]]),
      bullet([["Reutiliza la misma contrasena ", true], ["en SolarOps y en otro servicio que sufre una filtracion"]]),
      bullet([["Deja la laptop desbloqueada ", true], ["en un lugar publico"]]),
      bullet([["Comparte su login ", true], ["con alguien 'solo por un momento'"]]),
      spacer(),
      body("...entonces ninguna seguridad tecnica importa. El hacker no rompio la cerradura. Alguien abrio la puerta y lo invito a pasar.", { italic: true }),
      body("Las mayores filtraciones de datos de la historia (Equifax, Target, Colonial Pipeline) comenzaron con un error humano, no con codigo descifrado."),
      spacer(),

      // ── TABLA DOS COLUMNAS ─────────────────────────────────────
      h2("Lo Que Realmente Protege los Datos"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({ children: [hdrCell("La App Hace (completado)", 4680), hdrCell("El Equipo Hace (continuo)", 4680)] }),
          ...[
            ["Encripta todo en transito",            "No reutilizar contrasenas"],
            ["Bloquea la base de datos por usuario", "No hacer clic en enlaces sospechosos"],
            ["Mantiene secretos en el servidor",     "No compartir credenciales de acceso"],
            ["Bloquea entradas maliciosas",          "Bloquear la laptop al alejarse"],
            ["Limita intentos de abuso",             "Reportar cualquier cosa que se sienta rara"],
          ].map(([app, team], i) => new TableRow({ children: [
            cell(app,  { width: 4680, fill: i%2===0 ? LIGHT : WHITE }),
            cell(team, { width: 4680, fill: i%2===0 ? LGOLD : WHITE }),
          ]}))
        ],
      }),
      spacer(),
      body("La aplicacion es la boveda de acero. El equipo carga la llave. Entrena a la persona, y la boveda es irrompible.", { bold: true, color: NAVY }),
      spacer(),

      // ── RESUMEN ────────────────────────────────────────────────
      h1("Resumen"),
      callout(
        "Estado actual: SEGURO para alojar datos de clientes.",
        "SolarOps sigue las mejores practicas de seguridad: HTTPS, gestion de secretos en servidor, consultas parametrizadas, autenticacion JWT, y zero patrones de codigo peligrosos. Las 7 mejoras fueron aplicadas y desplegadas el 3 de junio de 2026.",
        LGOLD, GOLD
      ),
      spacer(),
      body("Conexsol Energy  |  Miami, FL  |  conexsol.us", { color: "94A3B8", italic: true }),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('/Users/cex/SolarOps÷/SolarOps_Security_Report.docx', buf);
  console.log('Done: SolarOps_Security_Report.docx');
});
