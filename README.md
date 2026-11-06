# Taller Motor Norte

Demo de taller mecánico de Agencia JS. Se publica sola en Cloudflare Workers cada vez que se sube a `main`.

## Qué tiene

- **Web** (`index.html`): servicios, testigos del salpicadero, calculadora de revisión, «Sigue tu reparación», opiniones y cita.
- **Asistente** (`chat.js`): responde las preguntas frecuentes con respuestas breves y **nunca da diagnósticos**. Ante un síntoma ofrece cita de diagnosis; si suena a peligro, pide no circular y llamar. Da citas reales: solo confirma cuando el servidor las ha guardado.
- **Servidor** (`worker.js`) con la base de datos D1 `taller-motor-norte`:
  - citas con horas libres reales (capacidad por hora y días cerrados);
  - seguimiento por matrícula; el cliente aprueba el presupuesto con las 4 últimas cifras de su teléfono;
  - servicios editables (precio, especificaciones, fotos);
  - facturas numeradas por año;
  - resumen de ventas.
- **Panel del taller** (`admin.html` + `admin.js`): se entra por el candado del pie de la web.
  - **Resumen**: ventas del periodo, días y meses más fuertes, tipos de trabajo y formas de pago.
  - **Citas**: confirmar, hecha, no vino, anular, editar, WhatsApp al cliente; capacidad y festivos.
  - **Reparaciones**: un toque por paso (recibido, diagnóstico, presupuesto, en reparación, listo, entregado), presupuesto, foto del móvil y «Facturar».
  - **Facturas**: solo cliente, trabajo y precio; los datos fiscales se ponen solos. Imprimir, archivo por meses, envío a la gestoría, descarga para Excel e impresión del listado.
  - **Servicios**: crear, editar, ordenar, ocultar y subir fotos.
  - **Mis datos**: razón social, NIF, dirección, correo de la empresa y correo de la gestoría.

## Contraseña del panel

- En la demo la contraseña es `taller-demo` y se rellena con datos de ejemplo.
- Para un taller real, añade en Cloudflare el secreto `ADMIN_HASH`, que es el sha256 de su contraseña. Desde ese momento no se inventan datos.
