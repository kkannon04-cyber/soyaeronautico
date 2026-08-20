// netlify/functions/test-email.js
// Endpoint TEMPORAL para verificar que el envío de correos vía Resend funciona
// correctamente ANTES de conectarlo al sistema real de registro/recuperación
// de usuarios (Supabase Auth). Debe borrarse una vez confirmada la prueba.
//
// Protegido por TEST_EMAIL_KEY (variable de entorno propia, separada de
// NOTICIAS_DEBUG_KEY): sin la clave correcta responde 404, igual que si el
// endpoint no existiera — mismo patrón ya usado en noticias.js.
//
// Uso: GET /.netlify/functions/test-email?key=TU_TEST_EMAIL_KEY&to=destino@ejemplo.com

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMITENTE = 'SoyAeronautico <no-reply@soyaeronautico.com>';

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};

  const CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type":                 "application/json",
    "Cache-Control":                "no-store",
  };

  // Si TEST_EMAIL_KEY no está configurada, el endpoint queda desactivado por
  // defecto (nunca accesible "por accidente" en un entorno mal configurado).
  const claveEsperada = process.env.TEST_EMAIL_KEY;
  if (!claveEsperada || params.key !== claveEsperada) {
    return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: "Not found" }) };
  }

  const to = (params.to || '').trim();
  if (!EMAIL_RE.test(to)) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Falta o es inválido el parámetro "to" (correo destinatario de la prueba).' }),
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'RESEND_API_KEY no está configurada en este entorno.' }),
    };
  }

  const ahora = new Date().toISOString();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: [to],
        subject: 'Prueba de envío — SoyAeronautico',
        html:
          '<div style="font-family:sans-serif;font-size:14px;color:#0F1B2D;">' +
            '<p>Este es un correo de prueba enviado desde <b>netlify/functions/test-email.js</b> ' +
            'para verificar la integración con Resend antes de conectarla al sistema de registro ' +
            'y recuperación de contraseña.</p>' +
            `<p style="color:#5B6B7F;font-size:12px;">Enviado: ${ahora}</p>` +
          '</div>',
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: CORS,
        body: JSON.stringify({ error: 'Resend respondió con error.', detail: data }),
      };
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ ok: true, to, resendId: data && data.id, sentAt: ahora }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'No se pudo contactar a Resend.', detail: err.message }),
    };
  }
};
