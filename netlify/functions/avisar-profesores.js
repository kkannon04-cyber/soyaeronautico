// netlify/functions/avisar-profesores.js
// Envía, vía Resend y desde no-reply@soyaeronautico.com, un correo puntual a
// los usuarios con rol "teacher" explicándoles que tienen ese rol y qué pueden
// hacer con él. Reutiliza el mismo remitente y el mismo estilo visual que
// send-auth-email.js para que el correo no parezca de otro sitio.
//
// NO es un envío automático ni recurrente: es una función que hay que invocar
// a mano, protegida por un secreto, y que por defecto funciona en modo de
// PRUEBA (no envía nada, solo devuelve a quién le escribiría).
//
// Uso:
//   POST /.netlify/functions/avisar-profesores
//   Header:  x-avisar-secreto: <AVISAR_PROFESORES_SECRET>
//   Body:    {"enviar": false}   -> simulacro: devuelve la lista de destinatarios
//            {"enviar": true}    -> envía de verdad
//            {"enviar": true, "solo": ["correo@ejemplo.com"]} -> filtra la lista
//            {"destinatarios": [{"email":"x@y.com","nombre":"X"}]} -> lista
//                          explícita; en ese caso NO se consulta Supabase.
//
// Variables de entorno en Netlify:
//   RESEND_API_KEY              (ya existe, la usa send-auth-email.js)
//   AVISAR_PROFESORES_SECRET    (nueva: cualquier cadena larga y aleatoria)
//   SUPABASE_SERVICE_ROLE_KEY   (opcional: sólo hace falta si NO se pasan
//                                "destinatarios" y hay que buscar quién tiene
//                                rol teacher leyendo auth.users)

const crypto = require('crypto');

const SUPABASE_URL = 'https://yszcglcnbpnyteytpfyc.supabase.co';
const REMITENTE = 'SoyAeronáutico <no-reply@soyaeronautico.com>';
const ASUNTO = 'Tu cuenta de SoyAeronáutico ya es de profesor';

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

// Comparación en tiempo constante, para no filtrar el secreto por temporización.
function secretoValido(recibido, esperado) {
  if (!recibido || !esperado) return false;
  const a = Buffer.from(String(recibido));
  const b = Buffer.from(String(esperado));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function armarHtml(nombre) {
  const saludo = nombre ? `Hola ${nombre},` : 'Hola,';
  return `
    <div style="font-family:'IBM Plex Sans',Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0F1B2D;">
      <p style="font-family:Archivo,Arial,sans-serif;font-weight:800;font-size:18px;color:#1657C6;margin:0 0 24px;">SoyAeronáutico</p>

      <h1 style="font-size:20px;margin:0 0 12px;">Tu cuenta ya es de profesor</h1>

      <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">${saludo}</p>

      <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
        Te escribimos para avisarte de que tu cuenta en SoyAeronáutico tiene el
        <b>rol de profesor</b>. Eso te habilita un panel propio, además del panel
        de estudiante que ya conocías.
      </p>

      <p style="font-size:14px;line-height:1.6;margin:0 0 8px;"><b>Qué puedes hacer desde ahí:</b></p>
      <ul style="font-size:14px;line-height:1.7;margin:0 0 16px;padding-left:20px;">
        <li><b>Crear grupos</b> y compartir un código de 6 caracteres para que tus estudiantes se unan.</li>
        <li><b>Armar bancos de preguntas</b> propios, escritos uno a uno o pegados en lote.</li>
        <li><b>Publicar actividades</b> de tres tipos: examen de opción múltiple, lectura con pregunta de control, y plan de vuelo en el simulador, con fecha límite e intentos máximos.</li>
        <li><b>Ver los resultados</b> de tu grupo: quién presentó, qué preguntas se fallan más, y descargarlo todo en Excel.</li>
        <li><b>Corregir a mano</b> lo que la calificación automática no haya entendido, y dejarle un comentario escrito al estudiante. Cada corrección queda registrada.</li>
      </ul>

      <a href="https://soyaeronautico.com/panel-profesor.html"
         style="display:inline-block;margin-top:8px;background:#1657C6;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 26px;border-radius:30px;">
        Abrir mi panel de profesor
      </a>

      <p style="font-size:13px;line-height:1.6;color:#5B6B7F;margin-top:24px;">
        Si tienes dudas o algo no funciona como esperabas, responde a este correo
        y lo revisamos.
      </p>

      <p style="font-size:12px;color:#5B6B7F;margin-top:28px;border-top:1px solid #E1E7EF;padding-top:14px;">
        Recibes este correo porque tu cuenta de SoyAeronáutico tiene rol de profesor.<br>
        SoyAeronáutico · Creado por Cristian Arcila
      </p>
    </div>
  `;
}

function armarTexto(nombre) {
  const saludo = nombre ? `Hola ${nombre},` : 'Hola,';
  return [
    'SoyAeronáutico — Tu cuenta ya es de profesor',
    '',
    saludo,
    '',
    'Te escribimos para avisarte de que tu cuenta en SoyAeronáutico tiene el rol',
    'de profesor. Eso te habilita un panel propio, además del panel de estudiante',
    'que ya conocías.',
    '',
    'Qué puedes hacer desde ahí:',
    '  - Crear grupos y compartir un código de 6 caracteres para que tus',
    '    estudiantes se unan.',
    '  - Armar bancos de preguntas propios, escritos uno a uno o pegados en lote.',
    '  - Publicar actividades de tres tipos: examen de opción múltiple, lectura',
    '    con pregunta de control, y plan de vuelo en el simulador, con fecha',
    '    límite e intentos máximos.',
    '  - Ver los resultados de tu grupo: quién presentó, qué preguntas se fallan',
    '    más, y descargarlo todo en Excel.',
    '  - Corregir a mano lo que la calificación automática no haya entendido, y',
    '    dejarle un comentario escrito al estudiante. Cada corrección queda',
    '    registrada.',
    '',
    'Abre tu panel: https://soyaeronautico.com/panel-profesor.html',
    '',
    'Si tienes dudas o algo no funciona como esperabas, responde a este correo y',
    'lo revisamos.',
    '',
    'Recibes este correo porque tu cuenta de SoyAeronáutico tiene rol de profesor.',
    'SoyAeronáutico · Creado por Cristian Arcila'
  ].join('\n');
}

// Lee los profesores con la service role key. Se necesita porque el correo
// vive en auth.users, que la anon key no puede leer.
async function obtenerProfesores(serviceKey) {
  const cab = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  const rPerfiles = await fetch(
    `${SUPABASE_URL}/rest/v1/perfiles?rol=eq.teacher&select=id,nombre,apellido`,
    { headers: cab }
  );
  if (!rPerfiles.ok) throw new Error(`No se pudieron leer los perfiles: ${await rPerfiles.text()}`);
  const perfiles = await rPerfiles.json();
  if (!perfiles.length) return [];

  // La API de administración devuelve los usuarios con su correo.
  const rUsuarios = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: cab });
  if (!rUsuarios.ok) throw new Error(`No se pudieron leer los usuarios: ${await rUsuarios.text()}`);
  const { users } = await rUsuarios.json();

  const porId = {};
  (users || []).forEach(u => { porId[u.id] = u; });

  return perfiles
    .map(p => {
      const u = porId[p.id];
      if (!u || !u.email) return null;
      const nombre = [p.nombre, p.apellido].filter(Boolean).join(' ').trim();
      return { id: p.id, email: u.email, nombre: nombre || null, confirmado: !!u.email_confirmed_at };
    })
    .filter(Boolean)
    // Nunca escribir a un correo que el propio usuario no ha confirmado.
    .filter(p => p.confirmado);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const secretoEsperado = process.env.AVISAR_PROFESORES_SECRET;
  const secretoRecibido = (event.headers || {})['x-avisar-secreto']
    || (event.headers || {})['X-Avisar-Secreto'];

  // Se separan los dos fallos a propósito. Decir "no hay secreto en el
  // servidor" no ayuda a adivinarlo — si no está configurado, el endpoint ya
  // está cerrado — y en cambio ahorra un diagnóstico a ciegas. Ojo: las
  // funciones de Netlify leen las variables del snapshot de SU deploy, así que
  // crear la variable no basta; hay que redesplegar para que la vea.
  if (!secretoEsperado) {
    return json(500, {
      error: 'AVISAR_PROFESORES_SECRET no está configurada en este despliegue.',
      pista: 'Si acabas de crear la variable en Netlify, vuelve a desplegar el sitio para que la función la vea.'
    });
  }
  if (!secretoValido(secretoRecibido, secretoEsperado)) {
    return json(401, { error: 'El secreto enviado no coincide.' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return json(500, { error: 'RESEND_API_KEY no configurada.' });

  let cuerpo = {};
  try { cuerpo = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido.' }); }

  // El envío real es opt-in explícito: sin "enviar": true esto es un simulacro.
  const enviarDeVerdad = cuerpo.enviar === true;
  const soloEstos = Array.isArray(cuerpo.solo) ? cuerpo.solo.map(s => String(s).toLowerCase()) : null;

  // Dos orígenes posibles. El explícito evita necesitar la service role key
  // para un envío puntual del que ya se sabe a quién va.
  let profesores;
  if (Array.isArray(cuerpo.destinatarios) && cuerpo.destinatarios.length) {
    profesores = cuerpo.destinatarios
      .filter(d => d && typeof d.email === 'string' && d.email.indexOf('@') > 0)
      .map(d => ({ email: d.email.trim(), nombre: (d.nombre || '').trim() || null }));
    if (!profesores.length) return json(400, { error: 'La lista de destinatarios no trae ningún correo válido.' });
  } else {
    if (!serviceKey) {
      return json(500, { error: 'Sin "destinatarios" en el cuerpo hace falta SUPABASE_SERVICE_ROLE_KEY para buscar los profesores.' });
    }
    try {
      profesores = await obtenerProfesores(serviceKey);
    } catch (e) {
      return json(502, { error: e.message });
    }
  }

  if (soloEstos) {
    profesores = profesores.filter(p => soloEstos.indexOf(p.email.toLowerCase()) !== -1);
  }

  if (!enviarDeVerdad) {
    return json(200, {
      modo: 'simulacro',
      nota: 'No se envió ningún correo. Repite con {"enviar": true} para enviarlo de verdad.',
      asunto: ASUNTO,
      remitente: REMITENTE,
      destinatarios: profesores.map(p => ({ email: p.email, nombre: p.nombre }))
    });
  }

  const resultados = [];
  for (const p of profesores) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: REMITENTE,
          to: [p.email],
          subject: ASUNTO,
          html: armarHtml(p.nombre),
          text: armarTexto(p.nombre)
        })
      });
      if (!res.ok) {
        resultados.push({ email: p.email, ok: false, error: await res.text().catch(() => 'sin detalle') });
      } else {
        const d = await res.json().catch(() => ({}));
        resultados.push({ email: p.email, ok: true, id: d.id || null });
      }
    } catch (err) {
      resultados.push({ email: p.email, ok: false, error: err.message });
    }
  }

  return json(200, {
    modo: 'envio',
    enviados: resultados.filter(r => r.ok).length,
    fallidos: resultados.filter(r => !r.ok).length,
    resultados
  });
};
