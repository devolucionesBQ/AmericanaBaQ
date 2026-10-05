# Despliegue en Cloud Run (repositorio privado)

Arquitectura: navegador → **Cloud Run** (`server/index.js`, sirve la interfaz y reenvía `/api`) → **Apps Script** (datos en Sheets/Drive y correos).
La URL `/exec` y la clave de la pasarela solo viven en variables de entorno del servidor.

## 1. Apps Script
1. Suba `Code.gs` (clasp push o pegar) y **Implementar → Administrar implementaciones → Editar → Nueva versión**. Copie la URL `/exec`.
2. **Configuración del proyecto → Propiedades de la secuencia de comandos**, agregue:
   - `GATEWAY_KEY` = una clave larga y aleatoria (32+ caracteres). Con ella, Apps Script solo atiende a la pasarela.
   - `URL_PUBLICA` = la URL final del aplicativo (p. ej. `https://devoluciones.americana.edu.co`), para los enlaces de los correos.

## 2. Cloud Run
1. En Google Cloud Console cree/seleccione un proyecto con facturación activa y habilite **Cloud Run** y **Cloud Build**.
2. **Cloud Run → Crear servicio → Implementar continuamente desde un repositorio**. Conecte GitHub (autorice el repositorio privado `DevolucionesBQ`), rama `main`, tipo de compilación **Dockerfile**.
3. Región `southamerica-east1` (o la más cercana), autenticación **Permitir invocaciones sin autenticar** (el acceso lo controla el login de la app), mínimo de instancias 0 o 1 (1 evita arranques en frío), memoria 512 MiB, tiempo de espera 300 s.
4. Variables de entorno:
   - `APPS_SCRIPT_URL` = URL `/exec` de Apps Script
   - `GATEWAY_KEY` = la misma clave del paso 1 (mejor como *Secret Manager*)
   - Opcionales: `MAX_BODY_MB` (60), `RATE_LIMIT_PER_MIN` (240), `UPSTREAM_TIMEOUT_S` (300)
5. Cada commit a `main` redespliega automáticamente.

## 3. Dominio propio
Cloud Run → **Administrar dominios personalizados** → agregue `devoluciones.americana.edu.co` y cree en el DNS los registros que indique Google (lo gestiona TI). El certificado HTTPS es automático.

## Límites que se mantienen (por usar Apps Script como backend)
Cuota diaria de correos de Gmail/Workspace, 6 minutos por ejecución y ~50 MB por solicitud (PDF grandes: probar con 40–50 MB).
