// netlify/functions/send-auth-email.js
// Recibe el webhook "Send Email" de Supabase Auth (signup, recuperación de
// contraseña, magic link, invitación, cambio de correo y reautenticación) y
// envía el correo correspondiente vía Resend desde no-reply@soyaeronautico.com.
// Reemplaza el envío propio de Supabase SIN tocar el frontend: login.html
// sigue llamando signUp()/resetPasswordForEmail() exactamente igual, y el
// "redirect_to" que ya arma loginConNext() llega intacto en el payload.
//
// Seguridad: el payload solo se procesa si trae una firma HMAC válida
// (Standard Webhooks — la misma convención que usan los Auth Hooks de
// Supabase), verificada contra SEND_EMAIL_HOOK_SECRET con el módulo "crypto"
// nativo de Node (sin SDK externo). Sin firma válida, nunca se llama a Resend.

const crypto = require('crypto');

// Mismo valor público que SUPABASE_URL en supabase-config.js — no es un
// secreto, es la URL del proyecto (el acceso real lo protege RLS).
const SUPABASE_URL = 'https://yszcglcnbpnyteytpfyc.supabase.co';
const REMITENTE = 'SoyAeronautico <no-reply@soyaeronautico.com>';
const MAX_DESFASE_RELOJ_SEG = 300; // 5 minutos — protección contra repetición del webhook

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

function obtenerHeader(headers, nombre) {
  const clave = Object.keys(headers || {}).find(k => k.toLowerCase() === nombre);
  return clave ? headers[clave] : undefined;
}

// El secreto que muestra Supabase puede venir como "v1,whsec_XXXX" o solo
// "whsec_XXXX"; en ambos casos la clave real es el base64 tras "whsec_".
function decodificarSecreto(crudo) {
  let s = (crudo || '').trim();
  if (s.startsWith('v1,')) s = s.slice(3);
  if (s.startsWith('whsec_')) s = s.slice(6);
  return Buffer.from(s, 'base64');
}

// Verificación de firma Standard Webhooks: HMAC-SHA256("{id}.{timestamp}.{body}")
// comparado contra cada firma "v1,<base64>" del header (puede traer varias
// por rotación de secreto), con comparación en tiempo constante.
function verificarFirma(headers, rawBody, secretoCrudo) {
  const id = obtenerHeader(headers, 'webhook-id');
  const timestamp = obtenerHeader(headers, 'webhook-timestamp');
  const firmaHeader = obtenerHeader(headers, 'webhook-signature');
  if (!id || !timestamp || !firmaHeader) return false;

  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_DESFASE_RELOJ_SEG) return false;

  const secretoBytes = decodificarSecreto(secretoCrudo);
  const contenidoFirmado = `${id}.${timestamp}.${rawBody}`;
  const esperada = crypto.createHmac('sha256', secretoBytes).update(contenidoFirmado).digest('base64');

  const candidatas = firmaHeader.split(' ').map(s => s.split(',')[1]).filter(Boolean);
  return candidatas.some(c => {
    try {
      const a = Buffer.from(c, 'base64');
      const b = Buffer.from(esperada, 'base64');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

// Un tipo por cada evento que el Send Email Hook puede disparar.
// "reauthentication" no usa enlace: Supabase entrega un código OTP que el
// usuario re-escribe en la app, no un link para hacer clic.
const PLANTILLAS = {
  signup:               { subject: 'Confirma tu cuenta — SoyAeronautico',        heading: 'Confirma tu cuenta',          cuerpo: 'Gracias por registrarte en SoyAeronautico. Confirma tu correo para activar tu cuenta y empezar a guardar tu progreso.', boton: 'Confirmar mi cuenta',   usaLink: true,  verifyType: 'signup' },
  recovery:              { subject: 'Restablece tu contraseña — SoyAeronautico', heading: 'Restablece tu contraseña',    cuerpo: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta. Si no fuiste tú, puedes ignorar este correo.', boton: 'Restablecer contraseña', usaLink: true,  verifyType: 'recovery' },
  magiclink:             { subject: 'Tu enlace de acceso — SoyAeronautico',      heading: 'Inicia sesión',               cuerpo: 'Usa este enlace para iniciar sesión en SoyAeronautico.',                                                          boton: 'Iniciar sesión',        usaLink: true,  verifyType: 'magiclink' },
  invite:                { subject: 'Te invitaron a SoyAeronautico',             heading: 'Tienes una invitación',       cuerpo: 'Te invitaron a crear una cuenta en SoyAeronautico.',                                                              boton: 'Aceptar invitación',    usaLink: true,  verifyType: 'invite' },
  email_change_current:  { subject: 'Confirma el cambio de correo — SoyAeronautico', heading: 'Confirma el cambio de correo', cuerpo: 'Solicitaste cambiar el correo de tu cuenta. Confirma desde tu correo actual para autorizar el cambio.',       boton: 'Confirmar cambio',      usaLink: true,  verifyType: 'email_change' },
  email_change_new:      { subject: 'Confirma tu nuevo correo — SoyAeronautico', heading: 'Confirma tu nuevo correo',    cuerpo: 'Confirma que este es tu nuevo correo para tu cuenta de SoyAeronautico.',                                          boton: 'Confirmar nuevo correo', usaLink: true, verifyType: 'email_change' },
  reauthentication:      { subject: 'Código de verificación — SoyAeronautico',   heading: 'Verifica tu identidad',       cuerpo: 'Usa el siguiente código para confirmar esta acción en tu cuenta:',                                                boton: null,                    usaLink: false },
};

function construirLink(tokenHash, redirectTo, verifyType) {
  const url = new URL(`${SUPABASE_URL}/auth/v1/verify`);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', verifyType);
  if (redirectTo) url.searchParams.set('redirect_to', redirectTo);
  return url.toString();
}

function armarHtml({ heading, cuerpo, link, boton, codigo }) {
  const botonHtml = link && boton
    ? `<a href="${link}" style="display:inline-block;margin-top:20px;background:#1657C6;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 26px;border-radius:30px;">${boton}</a>`
    : '';
  const codigoHtml = codigo
    ? `<p style="font-family:monospace;font-size:24px;font-weight:700;letter-spacing:4px;color:#0F1B2D;margin:20px 0;">${codigo}</p>`
    : '';
  const linkTextoHtml = link
    ? `<p style="font-size:12px;color:#5B6B7F;word-break:break-all;margin-top:18px;">Si el botón no funciona, copia y pega este enlace:<br>${link}</p>`
    : '';
  return `
    <div style="font-family:'IBM Plex Sans',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0F1B2D;">
      <p style="font-family:Archivo,Arial,sans-serif;font-weight:800;font-size:18px;color:#1657C6;margin:0 0 24px;">SoyAeronautico</p>
      <h1 style="font-size:20px;margin:0 0 12px;">${heading}</h1>
      <p style="font-size:14px;line-height:1.6;color:#0F1B2D;margin:0 0 4px;">${cuerpo}</p>
      ${codigoHtml}
      ${botonHtml}
      ${linkTextoHtml}
      <p style="font-size:12px;color:#5B6B7F;margin-top:32px;">Si no solicitaste esto, puedes ignorar este correo.</p>
    </div>
  `;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: { http_code: 405, message: 'Method not allowed' } });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');

  const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!hookSecret) {
    return json(500, { error: { http_code: 500, message: 'SEND_EMAIL_HOOK_SECRET no configurada.' } });
  }
  if (!verificarFirma(event.headers, rawBody, hookSecret)) {
    return json(401, { error: { http_code: 401, message: 'Firma de webhook inválida.' } });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: { http_code: 400, message: 'JSON inválido.' } });
  }

  const email = payload && payload.user && payload.user.email;
  const emailData = payload && payload.email_data;
  const tipo = emailData && emailData.email_action_type;
  const plantilla = PLANTILLAS[tipo];

  if (!email || !emailData || !plantilla) {
    return json(400, { error: { http_code: 400, message: `Payload incompleto o tipo no soportado: ${tipo}` } });
  }

  const link = plantilla.usaLink ? construirLink(emailData.token_hash, emailData.redirect_to, plantilla.verifyType) : null;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return json(500, { error: { http_code: 500, message: 'RESEND_API_KEY no configurada.' } });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMITENTE,
        to: [email],
        subject: plantilla.subject,
        html: armarHtml({
          heading: plantilla.heading,
          cuerpo: plantilla.cuerpo,
          link,
          boton: plantilla.boton,
          codigo: plantilla.usaLink ? null : emailData.token,
        }),
      }),
    });

    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      return json(502, { error: { http_code: 502, message: `Resend falló: ${detalle}` } });
    }

    return json(200, {});
  } catch (err) {
    return json(502, { error: { http_code: 502, message: `No se pudo contactar a Resend: ${err.message}` } });
  }
};
