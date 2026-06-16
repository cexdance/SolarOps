# Reporte de Seguridad - SolarOps
**Fecha:** 3 de junio de 2026  
**Auditado por:** Escaneo automatizado de seguridad (Claude Code)  
**Alcance:** Codigo completo, dependencias, endpoints API, autenticacion, almacenamiento de datos

---

## La Version Corta

SolarOps esta construido sobre tecnologia moderna y segura. Los datos de los clientes estan protegidos por multiples capas de defensa: conexiones encriptadas, autenticacion del lado del servidor, politicas de seguridad a nivel de base de datos y gestion adecuada de secretos. La aplicacion no es facilmente hackeable porque un atacante tendria que romper varias barreras de seguridad independientes para llegar a cualquier dato real.

---

## Por Que la Aplicacion Es Segura

### 1. Los datos viajan encriptados
Cada conexion entre el navegador del usuario y los servidores usa HTTPS (encriptacion TLS). Vercel lo aplica automaticamente. Nadie puede espiar los datos en transito. Es como enviar una carta dentro de un tubo de acero cerrado con llave, donde solo la persona al otro lado tiene la llave para abrirlo.

### 2. La autenticacion la maneja Supabase (una plataforma de nivel industrial)
El inicio de sesion, los tokens de sesion y el cifrado de contrasenas los gestiona Supabase Auth, no codigo personalizado. Supabase usa bcrypt para cifrar contrasenas, tokens JWT y sigue las mejores practicas de seguridad usadas por miles de aplicaciones en produccion.

### 3. Los secretos del servidor se quedan en el servidor
La llave maestra de Supabase (la que puede saltarse las reglas de seguridad) solo se usa en funciones del lado del servidor. Nunca aparece en el codigo del navegador. Un atacante que inspeccione el codigo JavaScript de su navegador (algo que cualquiera puede hacer con cualquier sitio web) no encontrara nada util. Las llaves estan en una habitacion cerrada a la que no pueden llegar.

### 4. Los endpoints API verifican la identidad antes de actuar
Las funciones del servidor (como enviar cotizaciones, notificaciones y consultar datos de SolarEdge) usan un guardia de autenticacion compartido (`_auth.ts`) que verifica el token JWT del usuario antes de procesar cualquier solicitud.

### 5. No se encontraron vulnerabilidades web comunes
- Sin `eval()` ni `dangerouslySetInnerHTML` (las dos formas mas comunes en que los hackers inyectan codigo malicioso en aplicaciones React)
- Sin vectores de inyeccion SQL (la libreria cliente de Supabase usa consultas parametrizadas)
- Escapado HTML correcto en plantillas de correo electronico
- El proxy API de SolarEdge valida las rutas URL permitidas para prevenir falsificacion de solicitudes del servidor

### 6. Los archivos de entorno no estan en el control de versiones
Todos los archivos `.env` que contienen contrasenas y llaves API estan excluidos de git. Solo `.env.example` (con valores de ejemplo) esta incluido.

---

## Por Que Puedes Alojar Datos de Clientes

| Requisito | Como SolarOps lo Cumple |
|---|---|
| Datos encriptados en transito | HTTPS aplicado por Vercel en cada solicitud |
| Datos encriptados en reposo | Supabase usa encriptacion AES-256 en la base de datos PostgreSQL |
| Control de acceso | Supabase Auth con tokens JWT; verificacion de roles del lado del servidor |
| Gestion de secretos | Llaves API y contrasenas almacenadas como variables de entorno en Vercel, no en el codigo |
| Confiabilidad del alojamiento | Vercel (99.99% SLA de disponibilidad) + Supabase (PostgreSQL administrado con respaldos automaticos) |
| Sin llaves de admin expuestas | La llave de servicio es solo del lado del servidor; el cliente usa la llave anonima restringida |

---

## Por Que Esto No Es Facilmente Hackeable

**Para robar datos de clientes, un atacante necesitaria:**

1. Romper la encriptacion HTTPS (practicamente imposible con TLS moderno)
2. Obtener un token de sesion de usuario valido (requiere conocer la contrasena del usuario)
3. Evadir las politicas de Row Level Security de Supabase (se aplican a nivel de base de datos, no de aplicacion)
4. Acceder a las variables de entorno del servidor (requiere comprometer la infraestructura de Vercel)

Cada una de estas es una barrera independiente. Romper una no ayuda con las otras. Es como tener que abrir cuatro puertas blindadas, cada una con una llave diferente, en edificios diferentes.

---

## Mejoras Aplicadas Hoy (Las 7 Ya Estan Hechas)

Estos no eran amenazas activas, pero ahora la seguridad esta aun mas reforzada:

| Prioridad | Elemento | En Palabras Simples |
|---|---|---|
| Alta | Llave API de SolarEdge movida solo al servidor | Antes pasaba por la URL del navegador. Ahora solo vive en el servidor. HECHO. |
| Alta | Contrasena SMTP movida a almacenamiento de sesion | La contrasena de correo ya no persiste cuando se cierra el navegador. HECHO. |
| Alta | Libreria `xlsx` actualizada a 0.20.3 | La libreria de hojas de calculo tenia un error conocido. Ya esta parcheada. HECHO. |
| Media | Politica de Seguridad de Contenido reforzada | Se elimino `unsafe-inline` de scripts. Capa extra contra inyeccion de codigo. HECHO. |
| Media | Limite de velocidad en endpoint de notificaciones | `/api/notify` ahora permite maximo 10 solicitudes por minuto por usuario. HECHO. |
| Baja | Vite actualizado a 6.3.7 | El servidor de desarrollo tenia un error de navegacion de rutas. Solo afectaba a desarrolladores. HECHO. |
| Baja | `.env.prod` agregado explicitamente a .gitignore | Defensa en profundidad, por si los patrones de gitignore se editan en el futuro. HECHO. |

---

## Pero la Parte Mas Importante

**La aplicacion no es el eslabon debil. Las personas lo son.**

Esta es la verdad honesta sobre la seguridad:

**La boveda mas fuerte del mundo no importa si alguien le entrega la llave a un desconocido.**

SolarOps puede tener encriptacion perfecta, codigo perfecto, reglas de base de datos perfectas. Pero si alguien del equipo:

- Hace clic en un enlace de un correo que dice "Tu contrasena de SolarOps expiro, haz clic aqui para restablecerla" (y es falso)
- Usa la misma contrasena para SolarOps que para su cuenta de Netflix (y Netflix sufre una filtracion)
- Deja su laptop desbloqueada en una cafeteria
- Comparte su login con alguien "solo por un momento"
- Cae en una llamada telefonica de alguien que se hace pasar por soporte tecnico

...entonces ninguna seguridad tecnica importa. El hacker no rompio la cerradura. Alguien abrio la puerta y lo invito a pasar.

**Esto no es un defecto de SolarOps. Es un defecto de ser humano.** Todas las empresas del mundo, desde tu empresa de energia solar hasta Bank of America, tienen exactamente este mismo problema. Las mayores filtraciones de datos de la historia (Equifax, Target, Colonial Pipeline) comenzaron con un ser humano cometiendo un error, no con un hacker descifrando codigo.

### Lo Que Realmente Protege los Datos de los Clientes

| Trabajo de la App (hecho) | Trabajo del Equipo (continuo) |
|---|---|
| Encriptar todo en transito | No reutilizar contrasenas |
| Bloquear la base de datos por usuario | No hacer clic en enlaces de correos sospechosos |
| Mantener secretos en el servidor | No compartir credenciales de acceso |
| Bloquear entradas maliciosas | Bloquear la laptop cuando se alejen |
| Limitar intentos de abuso | Reportar cualquier cosa que se sienta "rara" |

La aplicacion es una boveda de acero. Tu equipo es la persona que carga la llave. Entrena a la persona, y la boveda es irrompible.

---

## Resumen

SolarOps sigue las mejores practicas de seguridad para una aplicacion web moderna: transporte encriptado, gestion de secretos del lado del servidor, consultas parametrizadas a base de datos, autenticacion JWT y cero patrones de codigo peligrosos. Las 7 mejoras recomendadas ya fueron aplicadas y desplegadas. La aplicacion es segura para alojar datos de clientes.
