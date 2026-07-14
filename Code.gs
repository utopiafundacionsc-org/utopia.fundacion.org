/**
 * SORTEOS UTOPÍA — BACKEND COMPLETO EN GOOGLE SHEETS
 * Página pública + reservas + pagos + panel administrativo + roles + sorteo.
 */

const APP = Object.freeze({
  VERSION: '11.4.0',
  TZ: 'America/La_Paz',
  DEFAULT_RAFFLE_ID: 'RIFA-UTOPIA-2026',
  SESSION_SECONDS: 21600,
  SHEETS: {
    CONFIG: 'CONFIGURACION',
    RAFFLES: 'SORTEOS',
    PRIZES: 'PREMIOS',
    PARTICIPANTS: 'PARTICIPANTES',
    NUMBERS: 'NUMEROS',
    RESULTS: 'RESULTADOS',
    USERS: 'USUARIOS',
    CONTENT: 'CONTENIDO_PUBLICO',
    FAQ: 'PREGUNTAS_FRECUENTES',
    LOG: 'REGISTRO'
  }
});

const HEADERS = Object.freeze({
  CONFIG: ['CLAVE','VALOR','DESCRIPCION'],
  RAFFLES: [
    'ID_SORTEO','NOMBRE_SORTEO','DESCRIPCION','FECHA_SORTEO','PRECIO_NUMERO',
    'MONEDA','TOTAL_NUMEROS','ESTADO','IMAGEN_URL','PROYECTO_BENEFICIADO',
    'DESCRIPCION_PROYECTO','META_ECONOMICA','PUBLICADO','FECHA_ACTUALIZACION'
  ],
  PRIZES: [
    'ID_PREMIO','ID_SORTEO','ORDEN','NOMBRE_PREMIO','DESCRIPCION',
    'IMAGEN_URL','ESTADO','NUMERO_GANADOR','PUBLICADO','FECHA_ACTUALIZACION'
  ],
  PARTICIPANTS: [
    'FECHA_REGISTRO','ID_SORTEO','NUMERO_TICKET','NOMBRES_Y_APELLIDOS',
    'NUMERO_WHATSAPP','CORREO','CIUDAD','CEDULA_IDENTIDAD','METODO_PAGO',
    'ESTADO_PAGO','CODIGO_PARTICIPACION','COMPROBANTE_URL','OBSERVACIONES',
    'RESERVA_HASTA','APROBADO_POR','FECHA_ACTUALIZACION'
  ],
  NUMBERS: [
    'ID_SORTEO','NUMERO_TICKET','ESTADO','CODIGO_PARTICIPACION',
    'RESERVA_HASTA','OBSERVACIONES','ACTUALIZADO_POR','FECHA_ACTUALIZACION'
  ],
  RESULTS: [
    'ID_RESULTADO','ID_SORTEO','ID_PREMIO','ORDEN_PREMIO','NOMBRE_PREMIO',
    'NUMERO_TICKET','NOMBRES_Y_APELLIDOS','CIUDAD','CODIGO_PARTICIPACION',
    'FECHA_SORTEO','RESPONSABLE','PUBLICADO','BLOQUEADO',
    'COPY_FACEBOOK','COPY_INSTAGRAM','COPY_WHATSAPP'
  ],
  USERS: [
    'USUARIO','NOMBRE','CORREO','ROL','SALT','PASSWORD_HASH',
    'ESTADO','ULTIMO_ACCESO','FECHA_CREACION'
  ],
  CONTENT: [
    'ID_CONTENIDO','ID_SORTEO','ORDEN','TITULO','RESENA','IMAGEN_URL',
    'ACTIVO','FECHA_ACTUALIZACION'
  ],
  FAQ: [
    'ID_PREGUNTA','ID_SORTEO','ORDEN','PREGUNTA','RESPUESTA','ACTIVO',
    'FECHA_ACTUALIZACION'
  ],
  LOG: ['FECHA','USUARIO','ROL','ACCION','DETALLE']
});

const NUMBER_STATUS = Object.freeze({
  AVAILABLE: 'DISPONIBLE',
  RESERVED: 'RESERVADO',
  REVIEW: 'EN_REVISION',
  SOLD: 'VENDIDO',
  BLOCKED: 'BLOQUEADO'
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDIENTE',
  RECEIVED: 'COMPROBANTE_RECIBIDO',
  REVIEW: 'EN_REVISION',
  APPROVED: 'APROBADO',
  REJECTED: 'RECHAZADO',
  EXPIRED: 'VENCIDO'
});

const ROLES = Object.freeze({
  ADMIN: 'ADMINISTRADOR',
  OPERATOR: 'OPERADOR',
  FINANCE: 'FINANZAS',
  COMMS: 'COMUNICACION',
  AUDITOR: 'AUDITOR'
});

const ROLE_PERMISSIONS = Object.freeze({
  ADMINISTRADOR: ['*'],
  OPERADOR: ['DASHBOARD','PARTICIPANTS_READ','PARTICIPANTS_WRITE','PAYMENTS','NUMBERS','AUDIT'],
  FINANZAS: ['DASHBOARD','PARTICIPANTS_READ','PAYMENTS','REPORTS','AUDIT'],
  COMUNICACION: ['DASHBOARD','RESULTS','PUBLISH','AUDIT'],
  AUDITOR: ['DASHBOARD','PARTICIPANTS_READ','NUMBERS_READ','RESULTS_READ','REPORTS','AUDIT']
});

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Sorteos Utopía')
      .addItem('1. Configurar sistema', 'configurarSistema')
      .addItem('Migrar a versión 7 (con respaldo)', 'prepararMigracionV7')
      .addItem('2. Crear administrador inicial', 'crearAdministradorInicial')
      .addItem('Crear o reiniciar administrador', 'crearOReiniciarAdministrador')
      .addItem('Reparar acceso administrador', 'repararAccesoAdministrador')
      .addItem('Reparar sorteo actual', 'repararSorteoActual')
      .addSeparator()
      .addItem('Crear copia de seguridad', 'crearCopiaSeguridad')
      .addItem('Liberar reservas vencidas', 'liberarReservasVencidas')
      .addToUi();
  } catch (error) {
    console.log('onOpen funciona automáticamente desde Google Sheets.');
  }
}


/**
 * Migra la estructura anterior sin usar ventanas de SpreadsheetApp.getUi().
 * Ejecuta esta función solamente cuando todavía NO existan las hojas NUMEROS y USUARIOS.
 */
function prepararMigracionV7() {
  const ss = spreadsheetForSetup_();

  if (
    ss.getSheetByName(APP.SHEETS.NUMBERS) ||
    ss.getSheetByName(APP.SHEETS.USERS)
  ) {
    notify_(
      'Migración no ejecutada',
      'La estructura nueva ya existe porque se encontró NUMEROS o USUARIOS.'
    );

    return;
  }

  PropertiesService
    .getScriptProperties()
    .setProperty('SPREADSHEET_ID', ss.getId());

  const stamp = Utilities.formatDate(
    new Date(),
    APP.TZ,
    'yyyyMMdd-HHmmss'
  );

  const legacySheets = [
    APP.SHEETS.CONFIG,
    APP.SHEETS.RAFFLES,
    APP.SHEETS.PRIZES,
    APP.SHEETS.PARTICIPANTS,
    APP.SHEETS.RESULTS,
    APP.SHEETS.LOG
  ];

  const backups = [];

  legacySheets.forEach(function(name) {
    const sheet = ss.getSheetByName(name);

    if (!sheet) {
      return;
    }

    let backupName = (name + '_RESPALDO_' + stamp).slice(0, 99);
    let suffix = 1;

    while (ss.getSheetByName(backupName)) {
      const ending = '_' + suffix;
      backupName = (name + '_RESPALDO_' + stamp)
        .slice(0, 99 - ending.length) + ending;
      suffix += 1;
    }

    sheet.setName(backupName);
    backups.push(backupName);
  });

  configurarSistema();

  notify_(
    'Migración terminada',
    'Se conservaron ' + backups.length + ' hojas como respaldo. Ahora completa los datos ADMIN_* en CONFIGURACION y ejecuta crearAdministradorInicial.'
  );
}

/**
 * Crea el primer administrador leyendo los valores ADMIN_* desde CONFIGURACION.
 * La contraseña temporal se elimina de la hoja después de crear el usuario.
 */
function crearAdministradorInicial() {
  const config = configMap_();
  const username = normalizeUsername_(config.ADMIN_USUARIO_INICIAL || 'admin');
  const name = normalize_(config.ADMIN_NOMBRE_INICIAL || 'Administrador General');
  const email = normalize_(config.ADMIN_CORREO_INICIAL || '');
  const password = String(config.ADMIN_CLAVE_TEMPORAL || '');

  if (!username) {
    throw new Error('Completa ADMIN_USUARIO_INICIAL en la hoja CONFIGURACION.');
  }

  if (!name) {
    throw new Error('Completa ADMIN_NOMBRE_INICIAL en la hoja CONFIGURACION.');
  }

  if (password.length < 8) {
    throw new Error(
      'Escribe una contraseña de mínimo 8 caracteres en CONFIGURACION → ADMIN_CLAVE_TEMPORAL.'
    );
  }

  if (findUser_(username)) {
    throw new Error('El usuario ' + username + ' ya existe.');
  }

  const salt = Utilities.getUuid();
  const usersSheet = requiredSheet_(db_(), APP.SHEETS.USERS);

  usersSheet.appendRow([
    username,
    name,
    email,
    ROLES.ADMIN,
    salt,
    hashPassword_(password, salt),
    'ACTIVO',
    '',
    new Date()
  ]);

  clearConfigValue_('ADMIN_CLAVE_TEMPORAL');

  logAction_(
    {username:'SISTEMA', role:'SISTEMA'},
    'CREAR_ADMIN',
    username
  );

  notify_(
    'Administrador creado',
    'Usuario: ' + username + '. La contraseña temporal fue eliminada de CONFIGURACION.'
  );
}


/**
 * Crea el administrador indicado en CONFIGURACION o reinicia su contraseña
 * si ya existe. Usa exactamente el mismo algoritmo de seguridad que el login.
 *
 * Antes de ejecutar, completa en CONFIGURACION:
 * ADMIN_USUARIO_INICIAL
 * ADMIN_NOMBRE_INICIAL
 * ADMIN_CORREO_INICIAL
 * ADMIN_CLAVE_TEMPORAL
 */
function crearOReiniciarAdministrador() {
  const config = configMap_();
  const username = normalizeUsername_(
    config.ADMIN_USUARIO_INICIAL || ''
  );
  const name = normalize_(
    config.ADMIN_NOMBRE_INICIAL || 'Administrador General'
  );
  const email = normalize_(
    config.ADMIN_CORREO_INICIAL || ''
  );
  const password = String(
    config.ADMIN_CLAVE_TEMPORAL || ''
  ).trim();

  if (!username) {
    throw new Error(
      'Completa ADMIN_USUARIO_INICIAL en CONFIGURACION.'
    );
  }

  if (!name) {
    throw new Error(
      'Completa ADMIN_NOMBRE_INICIAL en CONFIGURACION.'
    );
  }

  if (password.length < 8) {
    throw new Error(
      'Escribe una contraseña de mínimo 8 caracteres en CONFIGURACION → ADMIN_CLAVE_TEMPORAL.'
    );
  }

  const usersSheet = requiredSheet_(
    db_(),
    APP.SHEETS.USERS
  );

  const existingUser = findUserForLogin_(username);
  const salt = Utilities.getUuid();
  const passwordHash = hashPassword_(
    password,
    salt
  );
  const now = new Date();

  const rowData = [[
    username,
    name,
    email,
    ROLES.ADMIN,
    salt,
    passwordHash,
    'ACTIVO',
    existingUser && existingUser.lastLogin
      ? existingUser.lastLogin
      : '',
    existingUser && existingUser.createdAt
      ? existingUser.createdAt
      : now
  ]];

  if (existingUser) {
    usersSheet
      .getRange(
        existingUser.row,
        1,
        1,
        HEADERS.USERS.length
      )
      .setValues(rowData);
  } else {
    usersSheet
      .getRange(
        usersSheet.getLastRow() + 1,
        1,
        1,
        HEADERS.USERS.length
      )
      .setValues(rowData);
  }

  const savedUser = findUserForLogin_(
    username
  );

  const credentialsAreValid = Boolean(
    savedUser &&
    savedUser.status === 'ACTIVO' &&
    savedUser.salt &&
    savedUser.passwordHash &&
    hashPassword_(
      password,
      savedUser.salt
    ) === savedUser.passwordHash
  );

  if (!credentialsAreValid) {
    throw new Error(
      'El usuario fue escrito, pero la comprobación interna de la contraseña falló.'
    );
  }

  clearConfigValue_(
    'ADMIN_CLAVE_TEMPORAL'
  );

  logAction_(
    {
      username: 'SISTEMA',
      role: 'SISTEMA'
    },
    existingUser
      ? 'REINICIAR_ADMIN'
      : 'CREAR_ADMIN',
    username + ' | CREDENCIALES_VERIFICADAS'
  );

  notify_(
    existingUser
      ? 'Administrador actualizado'
      : 'Administrador creado',
    'Credenciales verificadas correctamente. Usuario: ' +
      username +
      '. La contraseña temporal fue eliminada de CONFIGURACION.'
  );
}


/**
 * Comprueba que el usuario configurado existe, está activo y tiene
 * SALT/PASSWORD_HASH. Para comprobar también la contraseña, vuelve a escribirla
 * temporalmente en CONFIGURACION → ADMIN_CLAVE_TEMPORAL antes de ejecutar.
 */
function diagnosticarAccesoAdministrador() {
  const config = configMap_();
  const identifier = normalize_(
    config.ADMIN_USUARIO_INICIAL || ''
  );
  const password = String(
    config.ADMIN_CLAVE_TEMPORAL || ''
  );
  const user = findUserForLogin_(
    identifier
  );

  const result = {
    usuarioConfigurado: identifier,
    usuarioEncontrado: Boolean(user),
    usuarioGuardado: user
      ? user.username
      : '',
    correoGuardado: user
      ? user.email
      : '',
    rol: user
      ? user.role
      : '',
    estado: user
      ? user.status
      : '',
    tieneSalt: Boolean(
      user && user.salt
    ),
    tienePasswordHash: Boolean(
      user && user.passwordHash
    ),
    contrasenaComprobada:
      password.length >= 8,
    contrasenaCorrecta:
      Boolean(
        user &&
        password.length >= 8 &&
        hashPassword_(
          password,
          user.salt
        ) === user.passwordHash
      )
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  if (
    result.usuarioEncontrado &&
    result.estado === 'ACTIVO' &&
    result.tieneSalt &&
    result.tienePasswordHash &&
    (
      !result.contrasenaComprobada ||
      result.contrasenaCorrecta
    )
  ) {
    notify_(
      'Diagnóstico correcto',
      result.contrasenaComprobada
        ? 'El usuario y la contraseña son correctos dentro de Apps Script.'
        : 'El usuario está correcto. Para comprobar la contraseña, escríbela temporalmente en ADMIN_CLAVE_TEMPORAL y vuelve a ejecutar.'
    );
  } else {
    notify_(
      'Diagnóstico con error',
      'Abre el registro de ejecución para ver qué dato no coincide.'
    );
  }

  if (password.length >= 8) {
    clearConfigValue_(
      'ADMIN_CLAVE_TEMPORAL'
    );
  }

  return result;
}


/**
 * Repara definitivamente el acceso del administrador.
 *
 * Corrige estos casos:
 * - usuario antiguo guardado sin el símbolo @;
 * - filas duplicadas del mismo usuario/correo;
 * - SALT o PASSWORD_HASH desactualizados;
 * - estado diferente de ACTIVO;
 * - espacios accidentales en la contraseña temporal.
 *
 * Antes de ejecutar, completa en CONFIGURACION:
 * ADMIN_USUARIO_INICIAL
 * ADMIN_NOMBRE_INICIAL
 * ADMIN_CORREO_INICIAL
 * ADMIN_CLAVE_TEMPORAL
 */
function repararAccesoAdministrador() {
  const config = configMap_();

  const username = normalizeUsername_(
    config.ADMIN_USUARIO_INICIAL || ''
  );

  const name = normalize_(
    config.ADMIN_NOMBRE_INICIAL ||
    'Administrador General'
  );

  const email = normalize_(
    config.ADMIN_CORREO_INICIAL ||
    username
  )
    .toLowerCase()
    .replace(/\s+/g, '');

  const password = String(
    config.ADMIN_CLAVE_TEMPORAL || ''
  ).trim();

  if (!username) {
    throw new Error(
      'Completa ADMIN_USUARIO_INICIAL en CONFIGURACION.'
    );
  }

  if (password.length < 8) {
    throw new Error(
      'Escribe una contraseña de mínimo 8 caracteres en ADMIN_CLAVE_TEMPORAL.'
    );
  }

  const sheet = requiredSheet_(
    db_(),
    APP.SHEETS.USERS
  );

  const normalizedLegacy = username
    .replace(/@/g, '');

  const matchingRows = userRows_()
    .filter(function(item) {
      const itemUsername = normalizeUsername_(
        item.username
      );

      const itemEmail = normalize_(
        item.email
      )
        .toLowerCase()
        .replace(/\s+/g, '');

      return (
        itemUsername === username ||
        itemEmail === email ||
        itemUsername.replace(/@/g, '') ===
          normalizedLegacy
      );
    })
    .sort(function(a, b) {
      return a.row - b.row;
    });

  const targetRow = matchingRows.length
    ? matchingRows[0].row
    : sheet.getLastRow() + 1;

  const salt = Utilities.getUuid();

  const passwordHash = hashPassword_(
    password,
    salt
  );

  const now = new Date();

  const createdAt =
    matchingRows.length &&
    matchingRows[0].createdAt
      ? matchingRows[0].createdAt
      : now;

  sheet
    .getRange(
      targetRow,
      1,
      1,
      HEADERS.USERS.length
    )
    .setValues([[
      username,
      name,
      email,
      ROLES.ADMIN,
      salt,
      passwordHash,
      'ACTIVO',
      '',
      createdAt
    ]]);

  // Elimina duplicados de abajo hacia arriba.
  matchingRows
    .slice(1)
    .sort(function(a, b) {
      return b.row - a.row;
    })
    .forEach(function(item) {
      sheet.deleteRow(item.row);
    });

  SpreadsheetApp.flush();

  const savedUser = findUserForLogin_(
    username
  );

  const verified = Boolean(
    savedUser &&
    savedUser.username === username &&
    savedUser.status === 'ACTIVO' &&
    hashPassword_(
      password,
      savedUser.salt
    ) === savedUser.passwordHash
  );

  if (!verified) {
    throw new Error(
      'No se pudo verificar el administrador después de reparar la fila.'
    );
  }

  clearConfigValue_(
    'ADMIN_CLAVE_TEMPORAL'
  );

  logAction_(
    {
      username: 'SISTEMA',
      role: 'SISTEMA'
    },
    'REPARAR_ACCESO_ADMIN',
    username +
      ' | DUPLICADOS_ELIMINADOS: ' +
      Math.max(
        0,
        matchingRows.length - 1
      )
  );

  notify_(
    'Acceso reparado',
    'Usuario verificado: ' +
      username +
      '. Ya puedes ingresar con la nueva contraseña.'
  );

  return {
    ok: true,
    username: username,
    email: email,
    status: 'ACTIVO',
    duplicatesRemoved: Math.max(
      0,
      matchingRows.length - 1
    ),
    credentialsVerified: true
  };
}


/**
 * Vincula este proyecto con el Google Sheet abierto y repara el sorteo
 * principal sin borrar participantes, pagos, números ni usuarios.
 *
 * Ejecuta esta función una sola vez desde el editor de Apps Script cuando
 * el panel muestre los campos del sorteo en blanco.
 */
function repararSorteoActual() {
  const ss = spreadsheetForSetup_();

  PropertiesService
    .getScriptProperties()
    .setProperty(
      'SPREADSHEET_ID',
      ss.getId()
    );

  // Garantiza que todas las hojas necesarias existan.
  ensureSheet_(
    ss,
    APP.SHEETS.CONFIG,
    HEADERS.CONFIG
  );
  ensureSheet_(
    ss,
    APP.SHEETS.RAFFLES,
    HEADERS.RAFFLES
  );
  ensureSheet_(
    ss,
    APP.SHEETS.PRIZES,
    HEADERS.PRIZES
  );
  ensureSheet_(
    ss,
    APP.SHEETS.PARTICIPANTS,
    HEADERS.PARTICIPANTS
  );
  ensureSheet_(
    ss,
    APP.SHEETS.NUMBERS,
    HEADERS.NUMBERS
  );
  ensureSheet_(
    ss,
    APP.SHEETS.RESULTS,
    HEADERS.RESULTS
  );
  ensureSheet_(
    ss,
    APP.SHEETS.USERS,
    HEADERS.USERS
  );
  ensureSheet_(
    ss,
    APP.SHEETS.CONTENT,
    HEADERS.CONTENT
  );
  ensureSheet_(
    ss,
    APP.SHEETS.FAQ,
    HEADERS.FAQ
  );
  ensureSheet_(
    ss,
    APP.SHEETS.LOG,
    HEADERS.LOG
  );

  const raffleId = ensureDefaultRaffleData_(
    'SISTEMA'
  );

  notify_(
    'Sorteo reparado',
    'El sorteo ' +
      raffleId +
      ' quedó vinculado y disponible en el panel.'
  );

  return {
    ok: true,
    raffleId: raffleId,
    spreadsheetId: ss.getId()
  };
}

/**
 * Crea o completa el sorteo principal sin sobrescribir información válida.
 */
function ensureDefaultRaffleData_(updatedBy) {
  const ss = db_();

  const configSheet = ensureSheet_(
    ss,
    APP.SHEETS.CONFIG,
    HEADERS.CONFIG
  );

  const raffleSheet = ensureSheet_(
    ss,
    APP.SHEETS.RAFFLES,
    HEADERS.RAFFLES
  );

  const prizeSheet = ensureSheet_(
    ss,
    APP.SHEETS.PRIZES,
    HEADERS.PRIZES
  );

  const contentSheet = ensureSheet_(
    ss,
    APP.SHEETS.CONTENT,
    HEADERS.CONTENT
  );

  const faqSheet = ensureSheet_(
    ss,
    APP.SHEETS.FAQ,
    HEADERS.FAQ
  );

  ensureSheet_(
    ss,
    APP.SHEETS.NUMBERS,
    HEADERS.NUMBERS
  );

  upsertConfig_(
    configSheet,
    [[
      'SORTEO_ACTIVO',
      APP.DEFAULT_RAFFLE_ID,
      'Sorteo mostrado por defecto'
    ]]
  );

  const raffleDefaults = [
    APP.DEFAULT_RAFFLE_ID,
    'Rifa Solidaria Mundial 2026',
    'Tu aporte, su futuro. Juntos hacemos la diferencia.',
    new Date('2026-07-17T20:00:00-04:00'),
    50,
    'Bs',
    1000,
    'ACTIVO',
    '',
    'Proyectos que transforman vidas',
    'Lo recaudado apoya becas, talleres, capacitación y programas educativos y sociales.',
    50000,
    'SI',
    new Date()
  ];

  let raffleRow = findRowByValue_(
    raffleSheet,
    1,
    APP.DEFAULT_RAFFLE_ID
  );

  if (raffleRow < 2) {
    raffleSheet.appendRow(
      raffleDefaults
    );

    raffleRow = raffleSheet.getLastRow();
  } else {
    const current = raffleSheet
      .getRange(
        raffleRow,
        1,
        1,
        HEADERS.RAFFLES.length
      )
      .getValues()[0];

    const repaired = current.map(function(value, index) {
      const isBlank =
        value === '' ||
        value === null ||
        typeof value === 'undefined';

      return isBlank
        ? raffleDefaults[index]
        : value;
    });

    // El ID y la fecha de actualización deben quedar correctos.
    repaired[0] = APP.DEFAULT_RAFFLE_ID;
    repaired[13] = new Date();

    raffleSheet
      .getRange(
        raffleRow,
        1,
        1,
        HEADERS.RAFFLES.length
      )
      .setValues([repaired]);
  }

  const prizeDefaults = [
    [
      'PREMIO-001',
      APP.DEFAULT_RAFFLE_ID,
      1,
      'Televisor FLUX de 50" UHD 4K',
      'Smart Android 14',
      'assets/premio-televisor.jpg',
      'PENDIENTE',
      '',
      'NO',
      new Date()
    ],
    [
      'PREMIO-002',
      APP.DEFAULT_RAFFLE_ID,
      2,
      'Parlante MASTER-G',
      'Con batería, USB y Bluetooth',
      'assets/premio-parlante.jpg',
      'PENDIENTE',
      '',
      'NO',
      new Date()
    ],
    [
      'PREMIO-003',
      APP.DEFAULT_RAFFLE_ID,
      3,
      'Cafetera OSTER de 12 tazas',
      'Con filtro permanente',
      'assets/premio-cafetera.jpg',
      'PENDIENTE',
      '',
      'NO',
      new Date()
    ]
  ];

  prizeDefaults.forEach(function(row) {
    const found = findRowByValue_(
      prizeSheet,
      1,
      row[0]
    );

    if (found < 2) {
      prizeSheet.appendRow(row);
    }
  });

  const contentDefaults = [
    [
      'IMPACT-001',
      APP.DEFAULT_RAFFLE_ID,
      1,
      'Educación y becas',
      'Tu aporte contribuye a impulsar oportunidades educativas y acompañamiento formativo.',
      'assets/rifa-solidaria-2026.png',
      'SI',
      new Date()
    ],
    [
      'IMPACT-002',
      APP.DEFAULT_RAFFLE_ID,
      2,
      'Acción comunitaria',
      'Cada participación fortalece actividades solidarias, campañas y proyectos comunitarios.',
      'assets/logo-utopia.png.jpeg',
      'SI',
      new Date()
    ],
    [
      'IMPACT-003',
      APP.DEFAULT_RAFFLE_ID,
      3,
      'Transformación social',
      'La rifa apoya iniciativas con impacto real en personas, familias y comunidades.',
      'assets/logo-circulo-amigos-utopia.png',
      'SI',
      new Date()
    ]
  ];

  contentDefaults.forEach(function(row) {
    if (
      findRowByValue_(
        contentSheet,
        1,
        row[0]
      ) < 2
    ) {
      contentSheet.appendRow(row);
    }
  });

  const faqDefaults = [
    [
      'FAQ-001',
      APP.DEFAULT_RAFFLE_ID,
      1,
      '¿Cuándo queda vendido mi número?',
      'Cuando el equipo revisa y aprueba tu comprobante de pago.',
      'SI',
      new Date()
    ],
    [
      'FAQ-002',
      APP.DEFAULT_RAFFLE_ID,
      2,
      '¿Qué ocurre si mi reserva vence?',
      'El número vuelve a quedar disponible para otros participantes.',
      'SI',
      new Date()
    ],
    [
      'FAQ-003',
      APP.DEFAULT_RAFFLE_ID,
      3,
      '¿Puedo comprar varios números?',
      'Sí. Puedes seleccionar varios y el sistema calcula el total automáticamente.',
      'SI',
      new Date()
    ],
    [
      'FAQ-004',
      APP.DEFAULT_RAFFLE_ID,
      4,
      '¿Cómo consulto mis números?',
      'Ingresa tu WhatsApp en la sección Consulta y verás todos los números registrados a tu nombre.',
      'SI',
      new Date()
    ]
  ];

  faqDefaults.forEach(function(row) {
    if (
      findRowByValue_(
        faqSheet,
        1,
        row[0]
      ) < 2
    ) {
      faqSheet.appendRow(row);
    }
  });

  syncNumbersForRaffle_(
    APP.DEFAULT_RAFFLE_ID,
    1000,
    updatedBy || 'SISTEMA'
  );

  SpreadsheetApp.flush();

  return APP.DEFAULT_RAFFLE_ID;
}

function crearCopiaSeguridad() {
  const source = db_();
  const date = Utilities.formatDate(
    new Date(),
    APP.TZ,
    'yyyy-MM-dd_HH-mm'
  );

  const copy = DriveApp
    .getFileById(source.getId())
    .makeCopy('RESPALDO SORTEOS UTOPÍA ' + date);

  notify_('Copia de seguridad creada', copy.getUrl());
}

function liberarReservasVencidas() {
  const count = releaseExpiredReservations_();
  notify_('Reservas vencidas', 'Se liberaron ' + count + ' registros.');
}

function configurarSistema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abre Apps Script desde Google Sheets > Extensiones.');

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  const config = ensureSheet_(ss, APP.SHEETS.CONFIG, HEADERS.CONFIG);
  const raffles = ensureSheet_(ss, APP.SHEETS.RAFFLES, HEADERS.RAFFLES);
  const prizes = ensureSheet_(ss, APP.SHEETS.PRIZES, HEADERS.PRIZES);
  const participants = ensureSheet_(ss, APP.SHEETS.PARTICIPANTS, HEADERS.PARTICIPANTS);
  const numbers = ensureSheet_(ss, APP.SHEETS.NUMBERS, HEADERS.NUMBERS);
  const results = ensureSheet_(ss, APP.SHEETS.RESULTS, HEADERS.RESULTS);
  const users = ensureSheet_(ss, APP.SHEETS.USERS, HEADERS.USERS);
  const content = ensureSheet_(ss, APP.SHEETS.CONTENT, HEADERS.CONTENT);
  const faq = ensureSheet_(ss, APP.SHEETS.FAQ, HEADERS.FAQ);
  const log = ensureSheet_(ss, APP.SHEETS.LOG, HEADERS.LOG);

  upsertConfig_(config, [
    ['ORGANIZACION','Fundación Utopía','Nombre público de la organización'],
    ['SORTEO_ACTIVO',APP.DEFAULT_RAFFLE_ID,'Sorteo mostrado por defecto'],
    ['MINUTOS_RESERVA','15','Duración de una reserva temporal'],
    ['PERMITIR_NUMERO_REPETIDO','NO','SI permite que el mismo número gane más de un premio'],
    ['WHATSAPP_ADMIN','','Número de WhatsApp para recibir confirmaciones'],
    ['CONTACTO_WHATSAPP','+59164483623','WhatsApp público de Fundación Utopía'],
    ['FACEBOOK_URL','https://www.facebook.com/Fundautopia','Facebook público'],
    ['LINKEDIN_URL','https://www.linkedin.com/in/fundaci%C3%B3n-utop%C3%ADa-org/','LinkedIn público'],
    ['TIKTOK_URL','https://www.tiktok.com/@utopia.fundacion','TikTok público'],
    ['QR_PAGO_URL','assets/qr-pago.png','Imagen pública del QR de pago'],
    ['INSTRUCCIONES_PARTICIPACION','Selecciona tus números, acepta los términos, completa tus datos, paga mediante QR y adjunta el comprobante.','Texto antes del formulario'],
    ['TERMINOS_PARTICIPACION','Acepto los términos, condiciones y el tratamiento de mis datos para esta rifa.','Texto de aceptación'],
    ['MENSAJE_WHATSAPP_CONFIRMACION','Hola, registré mi participación en la rifa de Fundación Utopía.','Mensaje base de confirmación'],
    ['ACTUALIZACION_PUBLICA_SEGUNDOS','15','Frecuencia de actualización pública'],
    ['MOSTRAR_DATOS_COMPLETOS','NO','Se recomienda NO'],
    ['METODOS_PAGO','QR','Métodos de pago permitidos'],
    ['FONDO_SORTEO_EN_VIVO','assets/sorteos-en-vivo-utopia.png','Fondo del sorteo en vivo'],
    ['ADMIN_USUARIO_INICIAL','admin','Usuario del primer administrador'],
    ['ADMIN_NOMBRE_INICIAL','Administrador General','Nombre del primer administrador'],
    ['ADMIN_CORREO_INICIAL','','Correo del primer administrador'],
    ['ADMIN_CLAVE_TEMPORAL','','Escribe una contraseña de mínimo 8 caracteres y luego ejecuta crearAdministradorInicial']
  ]);

  if (findRowByValue_(raffles, 1, APP.DEFAULT_RAFFLE_ID) < 2) {
    raffles.appendRow([
      APP.DEFAULT_RAFFLE_ID,
      'Rifa Solidaria Mundial 2026',
      'Tu aporte, su futuro. Juntos hacemos la diferencia.',
      new Date('2026-07-17T20:00:00-04:00'),
      50,
      'Bs',
      1000,
      'ACTIVO',
      '',
      'Proyectos que transforman vidas',
      'Lo recaudado apoya becas, talleres, capacitación y programas educativos y sociales.',
      50000,
      'SI',
      new Date()
    ]);
  }

  const initialPrizes = [
    ['PREMIO-001',APP.DEFAULT_RAFFLE_ID,1,'Televisor FLUX de 50" UHD 4K','Smart Android 14','','PENDIENTE','','NO',new Date()],
    ['PREMIO-002',APP.DEFAULT_RAFFLE_ID,2,'Parlante MASTER-G','Con batería, USB y Bluetooth','','PENDIENTE','','NO',new Date()],
    ['PREMIO-003',APP.DEFAULT_RAFFLE_ID,3,'Cafetera OSTER de 12 tazas','Con filtro permanente','','PENDIENTE','','NO',new Date()]
  ];
  initialPrizes.forEach(function(row) {
    if (findRowByValue_(prizes, 1, row[0]) < 2) prizes.appendRow(row);
  });

  if (content.getLastRow() < 2) {
    content.getRange(2,1,3,HEADERS.CONTENT.length).setValues([
      ['IMPACT-001',APP.DEFAULT_RAFFLE_ID,1,'Educación y becas','Tu aporte contribuye a impulsar oportunidades educativas y acompañamiento formativo.','assets/rifa-solidaria-2026.png','SI',new Date()],
      ['IMPACT-002',APP.DEFAULT_RAFFLE_ID,2,'Acción comunitaria','Cada participación fortalece actividades solidarias, campañas y proyectos comunitarios.','assets/logo-utopia.png.jpeg','SI',new Date()],
      ['IMPACT-003',APP.DEFAULT_RAFFLE_ID,3,'Transformación social','La rifa apoya iniciativas con impacto real en personas, familias y comunidades.','assets/logo-circulo-amigos-utopia.png','SI',new Date()]
    ]);
  }

  if (faq.getLastRow() < 2) {
    faq.getRange(2,1,4,HEADERS.FAQ.length).setValues([
      ['FAQ-001',APP.DEFAULT_RAFFLE_ID,1,'¿Cuándo queda vendido mi número?','Cuando el equipo revisa y aprueba tu comprobante de pago.','SI',new Date()],
      ['FAQ-002',APP.DEFAULT_RAFFLE_ID,2,'¿Qué ocurre si mi reserva vence?','El número vuelve a quedar disponible para otros participantes.','SI',new Date()],
      ['FAQ-003',APP.DEFAULT_RAFFLE_ID,3,'¿Puedo comprar varios números?','Sí. Puedes seleccionar varios y el sistema calcula el total automáticamente.','SI',new Date()],
      ['FAQ-004',APP.DEFAULT_RAFFLE_ID,4,'¿Cómo consulto mis números?','Ingresa tu WhatsApp en la sección Consulta y verás todos los números registrados a tu nombre.','SI',new Date()]
    ]);
  }

  [config, raffles, prizes, participants, numbers, results, users, content, faq, log].forEach(styleSheet_);
  setValidations_(participants, numbers, raffles, prizes, users);
  syncNumbersForRaffle_(APP.DEFAULT_RAFFLE_ID, 1000, 'SISTEMA');
  ensureDefaultRaffleData_('SISTEMA');
  logAction_({username:'SISTEMA', role:'SISTEMA'}, 'CONFIGURAR_SISTEMA', 'Sistema configurado o actualizado.');
  notify_('Sistema configurado', 'El sorteo principal quedó creado o reparado. Ahora publica una nueva versión de la aplicación web.');
}

/* ============================ API ============================ */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = normalize_(p.action || 'health').toLowerCase();

    if (action === 'health') return json_({ok:true, app:'Sorteos Utopía', version:APP.VERSION});
    if (action === 'raffles') return json_(publicRaffles_());
    if (action === 'raffle') return json_(publicRaffle_(p.raffleId || APP.DEFAULT_RAFFLE_ID));
    if (action === 'board') return json_(publicBoard_(p.raffleId || APP.DEFAULT_RAFFLE_ID));
    if (action === 'winner') return json_(publicWinnerByPrize_(p.prizeId));
    if (action === 'winners') return json_(publicWinners_(p.raffleId || APP.DEFAULT_RAFFLE_ID));
    if (action === 'ticketsbyphone') return json_(publicTicketsByPhone_(p.raffleId || APP.DEFAULT_RAFFLE_ID, p.phone));

    return json_({ok:false, error:'Acción no reconocida.'});
  } catch (error) {
    logAction_({username:'PUBLICO', role:'PUBLICO'}, 'ERROR_GET', String(error.stack || error));
    return json_({ok:false, error:String(error.message || error)});
  }
}

function doPost(e) {
  try {
    const data = parseBody_(e);
    const action = normalize_(data.action).toLowerCase();

    if (action === 'reserve') return json_(reserveTickets_(data));
    if (action === 'cancelreservation') return json_(cancelReservation_(data));
    if (action === 'confirmregistration') return json_(confirmRegistration_(data));

    if (action === 'adminlogin') return json_(adminLogin_(data));
    if (action === 'adminsession') return json_(adminSession_(data));
    if (action === 'adminlogout') return json_(adminLogout_(data));
    if (action === 'adminraffles') return json_(adminRaffles_(data));
    if (action === 'adminrepaircurrentraffle') return json_(adminRepairCurrentRaffle_(data));
    if (action === 'admingetraffle') return json_(adminGetRaffle_(data));
    if (action === 'adminsaveraffle') return json_(adminSaveRaffle_(data));
    if (action === 'adminduplicateraffle') return json_(adminDuplicateRaffle_(data));
    if (action === 'adminsaveprize') return json_(adminSavePrize_(data));
    if (action === 'admindeleteprize') return json_(adminDeletePrize_(data));
    if (action === 'adminsetactiveraffle') return json_(adminSetActiveRaffle_(data));
    if (action === 'admindashboard') return json_(adminDashboard_(data));
    if (action === 'adminorders') return json_(adminOrders_(data));
    if (action === 'adminorderstatus') return json_(adminOrderStatus_(data));
    if (action === 'adminparticipants') return json_(adminParticipants_(data));
    if (action === 'adminupdateparticipant') return json_(adminUpdateParticipant_(data));
    if (action === 'adminpaymentdecision') return json_(adminPaymentDecision_(data));
    if (action === 'adminboard') return json_(adminBoard_(data));
    if (action === 'adminnumberaction') return json_(adminNumberAction_(data));
    if (action === 'adminbulknumberaction') return json_(adminBulkNumberAction_(data));
    if (action === 'adminreleasereservations') return json_(adminReleaseReservations_(data));
    if (action === 'adminlivedrawsetup') return json_(adminLiveDrawSetup_(data));
    if (action === 'adminlivedrawsync') return json_(adminLiveDrawSync_(data));
    if (action === 'adminlivedrawstart') return json_(adminLiveDrawStart_(data));
    if (action === 'adminlivedrawreveal') return json_(adminLiveDrawReveal_(data));
    if (action === 'adminlivedrawcancel') return json_(adminLiveDrawCancel_(data));
    if (action === 'admindrawpreview') return json_(adminDrawPreview_(data));
    if (action === 'admindraw') return json_(adminDraw_(data));
    if (action === 'adminresults') return json_(adminResults_(data));
    if (action === 'adminpublishresult') return json_(adminPublishResult_(data));
    if (action === 'adminreport') return json_(adminReport_(data));
    if (action === 'adminusers') return json_(adminUsers_(data));
    if (action === 'admincreateuser') return json_(adminCreateUser_(data));
    if (action === 'adminresetpassword') return json_(adminResetPassword_(data));
    if (action === 'adminupdateuserrole') return json_(adminUpdateUserRole_(data));
    if (action === 'adminchangepassword') return json_(adminChangePassword_(data));
    if (action === 'adminaudit') return json_(adminAudit_(data));
    if (action === 'adminsaveimpact') return json_(adminSaveImpact_(data));
    if (action === 'admindeleteimpact') return json_(adminDeleteImpact_(data));
    if (action === 'adminsavefaq') return json_(adminSaveFaq_(data));
    if (action === 'admindeletefaq') return json_(adminDeleteFaq_(data));
    if (action === 'adminuploadimage') return json_(adminUploadImage_(data));
    if (action === 'admincashpayment') return json_(adminCashPayment_(data));
    if (action === 'admintoggleuser') return json_(adminToggleUser_(data));
    if (action === 'adminsystemconfig') return json_(adminSystemConfig_(data));
    if (action === 'adminsavesystemconfig') return json_(adminSaveSystemConfig_(data));
    if (action === 'admintechnicalstatus') return json_(adminTechnicalStatus_(data));
    if (action === 'adminbackup') return json_(adminBackup_(data));

    return json_({ok:false, error:'Acción POST no reconocida.'});
  } catch (error) {
    const message = String(error.message || error);
    if (message === 'AUTH_EXPIRED') return json_({ok:false, authExpired:true, error:'La sesión venció.'});
    logAction_({username:'SISTEMA', role:'SISTEMA'}, 'ERROR_POST', String(error.stack || error));
    return json_({ok:false, error:message});
  }
}


function raffleConfigKey_(raffleId, key) {
  return 'SORTEO__' + normalize_(raffleId).replace(/[^a-zA-Z0-9_-]/g, '_') + '__' + key;
}

function raffleConfigMap_(raffleId) {
  const all = configMap_();
  const id = normalize_(raffleId || APP.DEFAULT_RAFFLE_ID);
  function value(key, fallback) {
    const specific = all[raffleConfigKey_(id, key)];
    if (specific !== '' && specific !== null && typeof specific !== 'undefined') return specific;
    const globalValue = all[key];
    if (globalValue !== '' && globalValue !== null && typeof globalValue !== 'undefined') return globalValue;
    return fallback;
  }
  const methods = String(value('METODOS_PAGO', 'QR')).split(/[,;\n]+/).map(function(item){return normalize_(item);}).filter(Boolean);
  return {
    organization: normalize_(value('ORGANIZACION', 'Fundación Utopía')),
    reservationMinutes: Math.max(1, Number(value('MINUTOS_RESERVA', 15))),
    publicRefreshSeconds: Math.max(5, Number(value('ACTUALIZACION_PUBLICA_SEGUNDOS', 15))),
    adminWhatsApp: normalize_(value('WHATSAPP_ADMIN', '')),
    contactWhatsApp: normalize_(value('CONTACTO_WHATSAPP', '+59164483623')),
    facebookUrl: normalize_(value('FACEBOOK_URL', '')),
    linkedinUrl: normalize_(value('LINKEDIN_URL', '')),
    tiktokUrl: normalize_(value('TIKTOK_URL', '')),
    termsText: normalize_(value('TERMINOS_PARTICIPACION', '')),
    qrPaymentUrl: normalize_(value('QR_PAGO_URL', 'assets/qr-pago.png')),
    paymentMethods: methods.length ? methods : ['QR'],
    allowRepeatedWinner: String(value('PERMITIR_NUMERO_REPETIDO', 'NO')).toUpperCase() === 'SI' ? 'SI' : 'NO',
    showFullData: String(value('MOSTRAR_DATOS_COMPLETOS', 'NO')).toUpperCase() === 'SI' ? 'SI' : 'NO',
    liveBackgroundUrl: normalize_(value('FONDO_SORTEO_EN_VIVO', 'assets/sorteos-en-vivo-utopia.png'))
  };
}

function saveRaffleConfig_(raffleId, input) {
  const sheet = requiredSheet_(db_(), APP.SHEETS.CONFIG);
  const id = normalize_(raffleId);
  const current = raffleConfigMap_(id);
  input = input || {};

  function has(key) {
    return Object.prototype.hasOwnProperty.call(input, key) && typeof input[key] !== 'undefined';
  }
  function pick(key, fallback) {
    return has(key) ? input[key] : (typeof current[key] !== 'undefined' ? current[key] : fallback);
  }

  const rawMethods = pick('paymentMethods', ['QR']);
  const methods = Array.isArray(rawMethods)
    ? rawMethods
    : String(rawMethods || 'QR').split(/[,;\n]+/);

  const rows = [
    ['ORGANIZACION', normalize_(pick('organization', 'Fundación Utopía')), 'Organización pública'],
    ['MINUTOS_RESERVA', String(Math.max(1, Number(pick('reservationMinutes', 15) || 15))), 'Duración de reserva'],
    ['ACTUALIZACION_PUBLICA_SEGUNDOS', String(Math.max(5, Number(pick('publicRefreshSeconds', 15) || 15))), 'Actualización pública'],
    ['WHATSAPP_ADMIN', normalize_(pick('adminWhatsApp', '')), 'WhatsApp interno'],
    ['CONTACTO_WHATSAPP', normalize_(pick('contactWhatsApp', '')), 'WhatsApp público'],
    ['FACEBOOK_URL', normalize_(pick('facebookUrl', '')), 'Facebook'],
    ['LINKEDIN_URL', normalize_(pick('linkedinUrl', '')), 'LinkedIn'],
    ['TIKTOK_URL', normalize_(pick('tiktokUrl', '')), 'TikTok'],
    ['TERMINOS_PARTICIPACION', normalize_(pick('termsText', '')), 'Términos'],
    ['QR_PAGO_URL', normalize_(pick('qrPaymentUrl', 'assets/qr-pago.png')) || 'assets/qr-pago.png', 'QR de pago'],
    ['METODOS_PAGO', methods.map(normalize_).filter(Boolean).join(',') || 'QR', 'Métodos de pago'],
    ['PERMITIR_NUMERO_REPETIDO', String(pick('allowRepeatedWinner', 'NO')).toUpperCase() === 'SI' ? 'SI' : 'NO', 'Ganador repetido'],
    ['MOSTRAR_DATOS_COMPLETOS', String(pick('showFullData', 'NO')).toUpperCase() === 'SI' ? 'SI' : 'NO', 'Mostrar datos completos'],
    ['FONDO_SORTEO_EN_VIVO', normalize_(pick('liveBackgroundUrl', 'assets/sorteos-en-vivo-utopia.png')) || 'assets/sorteos-en-vivo-utopia.png', 'Fondo sorteo en vivo']
  ];

  rows.forEach(function(row){
    upsertConfig_(sheet, [[raffleConfigKey_(id, row[0]), row[1], row[2] + ' | ' + id]]);
  });
}

function prizeImageFallback_(order) {
  return ({1:'assets/premio-televisor.jpg',2:'assets/premio-parlante.jpg',3:'assets/premio-cafetera.jpg'})[Number(order)] || 'assets/rifa-solidaria-2026.png';
}

function publicImageUrl_(value, fallback) {
  const text = normalize_(value);
  if (!text) return fallback || '';
  const match = text.match(/\/d\/([a-zA-Z0-9_-]+)/) || text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w2000' : text;
}

/* ======================== PÚBLICO ======================== */

function publicRaffles_() {
  const config = configMap_();
  const principalId = normalize_(config.SORTEO_ACTIVO || APP.DEFAULT_RAFFLE_ID);
  const allowedStatuses = ['ACTIVO','PROGRAMADO'];
  let rows = raffleRows_().filter(function(item) {
    return item.published === 'SI' && allowedStatuses.indexOf(String(item.status).toUpperCase()) >= 0;
  });
  if (!rows.length) {
    const principal = raffleById_(principalId);
    if (principal) rows = [principal];
  }
  rows.sort(function(a,b) {
    if (a.id === principalId) return -1;
    if (b.id === principalId) return 1;
    return Number(a.drawDate || 0) - Number(b.drawDate || 0);
  });
  return {
    ok:true,
    principalRaffleId:principalId,
    raffles:rows.map(function(item) {
      return {id:item.id,name:item.name,status:item.status,drawDate:iso_(item.drawDate),ticketPrice:item.ticketPrice,currency:item.currency,totalTickets:item.totalTickets};
    })
  };
}

function publicRaffle_(raffleId) {
  releaseExpiredReservations_(raffleId);
  const raffle = raffleById_(raffleId);
  if (!raffle) return {ok:false, error:'Sorteo no encontrado.'};
  const cfg = raffleConfigMap_(raffle.id);
  return {
    ok:true,
    raffle:{
      id:raffle.id,
      name:raffle.name,
      description:raffle.description,
      drawDate:iso_(raffle.drawDate),
      ticketPrice:raffle.ticketPrice,
      currency:raffle.currency,
      totalTickets:raffle.totalTickets,
      status:raffle.status,
      imageUrl:publicImageUrl_(raffle.imageUrl, 'assets/rifa-solidaria-2026.png'),
      organization:cfg.organization,
      reservationMinutes:cfg.reservationMinutes,
      publicRefreshSeconds:cfg.publicRefreshSeconds,
      contactWhatsApp:cfg.contactWhatsApp,
      facebookUrl:cfg.facebookUrl,
      linkedinUrl:cfg.linkedinUrl,
      tiktokUrl:cfg.tiktokUrl,
      qrPaymentUrl:publicImageUrl_(cfg.qrPaymentUrl, 'assets/qr-pago.png'),
      termsText:cfg.termsText,
      paymentMethods:cfg.paymentMethods,
      allowRepeatedWinner:cfg.allowRepeatedWinner,
      showFullData:cfg.showFullData,
      liveBackgroundUrl:publicImageUrl_(cfg.liveBackgroundUrl, 'assets/sorteos-en-vivo-utopia.png'),
      impactItems:impactRows_(raffle.id, true).map(function(item){return {id:item.id,order:item.order,title:item.title,text:item.text,image:publicImageUrl_(item.imageUrl,'assets/rifa-solidaria-2026.png')};}),
      faqItems:faqRows_(raffle.id, true).map(function(item){return {id:item.id,order:item.order,question:item.question,answer:item.answer};}),
      prizes:prizesByRaffle_(raffle.id).filter(function(item){return item.status!=='DESACTIVADO';}).sort(sortByOrder_).map(publicPrize_)
    }
  };
}

function publicBoard_(raffleId) {
  releaseExpiredReservations_(raffleId);
  const raffle = raffleById_(raffleId);
  if (!raffle) return {ok:false, error:'Sorteo no encontrado.'};
  syncNumbersForRaffle_(raffleId, raffle.totalTickets, 'SISTEMA');
  const rows = numberRows_(raffleId).filter(function(item) {
    return Number(item.number) < raffle.totalTickets;
  });
  const stats = numberStats_(rows);
  return {
    ok:true,
    reservationMinutes:raffleConfigMap_(raffle.id).reservationMinutes,
    stats:stats,
    tickets:rows.map(function(item) {
      return {number:item.number, status:item.status, label:item.status};
    })
  };
}

function publicWinnerByPrize_(prizeId) {
  const result = resultByPrize_(prizeId);
  if (!result || result.published !== 'SI') return {ok:false, error:'Todavía no existe un ganador publicado.'};
  return {ok:true, winner:publicResult_(result)};
}

function publicWinners_(raffleId) {
  const results = resultRows_(raffleId)
    .filter(function(item) { return item.published === 'SI'; })
    .sort(sortByOrder_)
    .map(publicResult_);
  return {ok:true, winners:results};
}

function publicTicketsByPhone_(raffleId, phoneInput) {
  const phone = normalizePhone_(phoneInput);
  if (!phone) return {ok:false, error:'Ingresa tu número de WhatsApp.'};
  const rows = participantRows_(raffleId).filter(function(item) {
    return phonesMatch_(item.phone, phone);
  });
  if (!rows.length) return {ok:false, error:'No se encontraron números registrados con ese WhatsApp.'};
  rows.sort(function(a,b){ return Number(a.ticket) - Number(b.ticket); });
  return {
    ok:true,
    fullName:rows[0].fullName,
    tickets:rows.map(function(item) {
      return {number:item.ticket, status:item.paymentStatus, code:item.code};
    })
  };
}

function reserveTickets_(data) {
  validatePublicParticipant_(data);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    releaseExpiredReservations_(data.raffleId || APP.DEFAULT_RAFFLE_ID);
    const raffle = raffleById_(data.raffleId || APP.DEFAULT_RAFFLE_ID);
    if (!raffle) throw new Error('Sorteo no encontrado.');
    if (raffle.status !== 'ACTIVO') throw new Error('El sorteo no está activo.');

    const tickets = normalizeTickets_(data.tickets, raffle.totalTickets);
    const numberMap = numberRowMap_(raffle.id);
    const unavailable = tickets.filter(function(ticket) {
      return !numberMap[ticket] || numberMap[ticket].status !== NUMBER_STATUS.AVAILABLE;
    });
    if (unavailable.length) return {ok:false, error:'Algunos números ya no están disponibles.', unavailableTickets:unavailable};

    const now = new Date();
    const cfg = raffleConfigMap_(raffle.id);
    const minutes = cfg.reservationMinutes;
    const requestedMethod = normalize_(data.paymentMethod || 'QR').toUpperCase();
    const allowedMethods = cfg.paymentMethods.map(function(item){return normalize_(item).toUpperCase();});
    if (allowedMethods.indexOf(requestedMethod) < 0) throw new Error('Método de pago no permitido.');
    const expiresAt = new Date(now.getTime() + minutes * 60000);
    const code = participationCode_();
    const participantSheet = requiredSheet_(db_(), APP.SHEETS.PARTICIPANTS);

    const rows = tickets.map(function(ticket) {
      return [
        now, raffle.id, ticket, normalize_(data.fullName), normalizePhoneDisplay_(data.phone),
        normalize_(data.email), normalize_(data.city), normalize_(data.identityNumber),
        requestedMethod, PAYMENT_STATUS.PENDING, code, '', '', expiresAt, '', now
      ];
    });
    participantSheet.getRange(participantSheet.getLastRow()+1,1,rows.length,HEADERS.PARTICIPANTS.length).setValues(rows);

    const numberSheet = requiredSheet_(db_(), APP.SHEETS.NUMBERS);
    tickets.forEach(function(ticket) {
      const item = numberMap[ticket];
      numberSheet.getRange(item.row,3,1,6).setValues([[
        NUMBER_STATUS.RESERVED, code, expiresAt, 'Reserva pública', 'PUBLICO', now
      ]]);
    });

    logAction_({username:'PUBLICO', role:'PUBLICO'}, 'RESERVAR_NUMEROS', code + ' | ' + tickets.join(', '));
    return {ok:true, participationCode:code, expiresAt:expiresAt.toISOString(), tickets:tickets};
  } finally {
    lock.releaseLock();
  }
}

function cancelReservation_(data) {
  const code = normalize_(data.participationCode);
  if (!code) throw new Error('Código de reserva no válido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const count = releaseParticipation_(code, PAYMENT_STATUS.EXPIRED, 'Reserva cancelada por el participante', 'PUBLICO');
    return {ok:true, released:count};
  } finally {
    lock.releaseLock();
  }
}

function confirmRegistration_(data) {
  const code = normalize_(data.participationCode);
  if (!code) throw new Error('Primero debes reservar tus números.');
  const reservationRows = participantRows_().filter(function(item){ return item.code === code; });
  const proofRequired = !reservationRows.length || normalize_(reservationRows[0].paymentMethod).toUpperCase() !== 'EFECTIVO';
  if (proofRequired && (!data.proofBase64 || !data.proofName || !data.proofMime)) throw new Error('Adjunta el comprobante de pago.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    releaseExpiredReservations_(data.raffleId || APP.DEFAULT_RAFFLE_ID);
    const rows = participantRows_().filter(function(item) { return item.code === code; });
    if (!rows.length) throw new Error('La reserva no existe o ya venció.');
    if (rows.some(function(item){ return item.paymentStatus !== PAYMENT_STATUS.PENDING; })) {
      throw new Error('La reserva ya fue procesada.');
    }
    const now = new Date();
    if (rows.some(function(item){ return !item.reservedUntil || item.reservedUntil.getTime() <= now.getTime(); })) {
      releaseParticipation_(code, PAYMENT_STATUS.EXPIRED, 'Reserva vencida', 'SISTEMA');
      throw new Error('La reserva venció. Selecciona nuevamente tus números.');
    }

    const proofUrl = proofRequired ? saveProof_(data, code) : '';
    const participantSheet = requiredSheet_(db_(), APP.SHEETS.PARTICIPANTS);
    const numberSheet = requiredSheet_(db_(), APP.SHEETS.NUMBERS);
    const numberMap = numberRowMap_(rows[0].raffleId);

    rows.forEach(function(item) {
      participantSheet.getRange(item.row,10).setValue(PAYMENT_STATUS.RECEIVED);
      participantSheet.getRange(item.row,12).setValue(proofUrl);
      participantSheet.getRange(item.row,14).setValue('');
      participantSheet.getRange(item.row,16).setValue(now);
      const numberItem = numberMap[item.ticket];
      if (numberItem) {
        numberSheet.getRange(numberItem.row,3,1,6).setValues([[
          NUMBER_STATUS.REVIEW, code, '', 'Comprobante recibido', 'PUBLICO', now
        ]]);
      }
    });

    const raffle = raffleById_(rows[0].raffleId);
    logAction_({username:'PUBLICO', role:'PUBLICO'}, 'ENVIAR_COMPROBANTE', code);
    return {
      ok:true,
      participationCode:code,
      fullName:rows[0].fullName,
      tickets:rows.map(function(item){return item.ticket;}),
      totalAmount:rows.length * raffle.ticketPrice,
      currency:raffle.currency,
      status:PAYMENT_STATUS.RECEIVED,
      proofUrl:proofUrl
    };
  } finally {
    lock.releaseLock();
  }
}

/* ======================== AUTENTICACIÓN ======================== */

function adminLogin_(data) {
  const identifier = normalize_(data.username);
  const normalizedIdentifier = normalizeUsername_(identifier);
  const password = String(data.password || '').trim();
  const user = findUserForLogin_(identifier);

  if (
    !user ||
    user.status !== 'ACTIVO' ||
    !user.salt ||
    !user.passwordHash ||
    hashPassword_(password, user.salt) !== user.passwordHash
  ) {
    logAction_(
      {
        username: normalizedIdentifier || 'DESCONOCIDO',
        role: 'DESCONOCIDO'
      },
      'LOGIN_FALLIDO',
      user
        ? 'Usuario encontrado, pero estado o contraseña no válidos.'
        : 'Usuario o correo no encontrado.'
    );

    return {
      ok: false,
      error: 'Usuario o contraseña incorrectos.'
    };
  }

  const token =
    Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '');

  const session = {
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role
  };

  CacheService
    .getScriptCache()
    .put(
      'SESSION_' + token,
      JSON.stringify(session),
      APP.SESSION_SECONDS
    );

  const sheet = requiredSheet_(
    db_(),
    APP.SHEETS.USERS
  );

  sheet
    .getRange(user.row, 8)
    .setValue(new Date());

  logAction_(
    session,
    'INICIAR_SESION',
    ''
  );

  return {
    ok: true,
    token: token,
    user: session
  };
}

function adminSession_(data) {
  const session = requireSession_(data.token);
  return {ok:true, user:session};
}

function adminLogout_(data) {
  const session = requireSession_(data.token);
  CacheService.getScriptCache().remove('SESSION_' + data.token);
  logAction_(session, 'CERRAR_SESION', '');
  return {ok:true};
}

function requireSession_(token, permission) {
  if (!token) throw new Error('AUTH_EXPIRED');
  const raw = CacheService.getScriptCache().get('SESSION_' + token);
  if (!raw) throw new Error('AUTH_EXPIRED');
  const session = JSON.parse(raw);
  CacheService.getScriptCache().put('SESSION_' + token, raw, APP.SESSION_SECONDS);
  if (permission && !hasPermission_(session.role, permission)) throw new Error('No tienes permiso para realizar esta acción.');
  return session;
}

function hasPermission_(role, permission) {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.indexOf('*') >= 0 || permissions.indexOf(permission) >= 0;
}

/* ======================== ADMINISTRACIÓN ======================== */

function adminRaffles_(data) {
  requireSession_(data.token, 'DASHBOARD');

  let raffles = raffleRows_();

  // El panel nunca debe quedar vacío. Si no existe el sorteo configurado,
  // lo repara automáticamente sin borrar información existente.
  const config = configMap_();
  const activeRaffleId = normalize_(
    config.SORTEO_ACTIVO || APP.DEFAULT_RAFFLE_ID
  );

  if (
    raffles.length === 0 ||
    !raffles.some(function(item) {
      return item.id === activeRaffleId;
    })
  ) {
    ensureDefaultRaffleData_('SISTEMA');
    raffles = raffleRows_();
  }

  return {
    ok: true,
    activeRaffleId: activeRaffleId,
    raffles: raffles.map(function(item) {
      return {
        id: item.id,
        name: item.name,
        status: item.status,
        drawDate: iso_(item.drawDate)
      };
    })
  };
}

function adminRepairCurrentRaffle_(data) {
  const session = requireSession_(
    data.token,
    '*'
  );

  const raffleId = ensureDefaultRaffleData_(
    session.username
  );

  logAction_(
    session,
    'REPARAR_SORTEO_ACTUAL',
    raffleId
  );

  return {
    ok: true,
    raffleId: raffleId
  };
}

function adminGetRaffle_(data) {
  requireSession_(data.token, 'DASHBOARD');

  let raffle = raffleById_(data.raffleId);

  if (
    !raffle &&
    normalize_(data.raffleId) === APP.DEFAULT_RAFFLE_ID
  ) {
    ensureDefaultRaffleData_('SISTEMA');
    raffle = raffleById_(data.raffleId);
  }

  if (!raffle) {
    return {
      ok: false,
      error: 'Sorteo no encontrado. Ejecuta repararSorteoActual desde Apps Script.'
    };
  }

  const cfg = raffleConfigMap_(raffle.id);
  return {
    ok:true,
    raffle:{
      id:raffle.id,name:raffle.name,description:raffle.description,
      drawDate:iso_(raffle.drawDate),drawDateLocal:localDateTime_(raffle.drawDate),
      ticketPrice:raffle.ticketPrice,currency:raffle.currency,totalTickets:raffle.totalTickets,
      status:raffle.status,imageUrl:publicImageUrl_(raffle.imageUrl, 'assets/rifa-solidaria-2026.png'),published:raffle.published==='SI',
      reservationMinutes:cfg.reservationMinutes,
      contactWhatsApp:cfg.contactWhatsApp,
      facebookUrl:cfg.facebookUrl,
      linkedinUrl:cfg.linkedinUrl,
      tiktokUrl:cfg.tiktokUrl
    },
    prizes:prizesByRaffle_(raffle.id).map(function(prize){prize.imageUrl=publicImageUrl_(prize.imageUrl,prizeImageFallback_(prize.order));return prize;}),
    impactItems:impactRows_(raffle.id, false),
    faqItems:faqRows_(raffle.id, false)
  };
}

function adminSaveRaffle_(data) {
  const session = requireSession_(data.token, '*');
  const input = parseJson_(data.raffle);
  if (!input.name || !input.drawDate || Number(input.totalTickets) < 1) throw new Error('Completa los datos obligatorios.');
  const sheet = requiredSheet_(db_(), APP.SHEETS.RAFFLES);
  const id = normalize_(input.id) || ('SORTEO-' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd-HHmmss'));
  const existing = raffleById_(id);
  const rowData = [
    id,normalize_(input.name),normalize_(input.description),new Date(input.drawDate),
    Number(input.ticketPrice || 0),normalize_(input.currency || 'Bs'),Number(input.totalTickets),
    normalize_(input.status || 'PAUSADO'),normalize_(input.imageUrl),'',
    '',0,input.published===false?'NO':'SI',new Date()
  ];
  if (existing) sheet.getRange(existing.row,1,1,rowData.length).setValues([rowData]);
  else sheet.appendRow(rowData);
  syncNumbersForRaffle_(id, Number(input.totalTickets), session.username);
  saveRaffleConfig_(id, {
    reservationMinutes:input.reservationMinutes,
    contactWhatsApp:input.contactWhatsApp,
    facebookUrl:input.facebookUrl,
    linkedinUrl:input.linkedinUrl,
    tiktokUrl:input.tiktokUrl
  });
  logAction_(session, existing ? 'EDITAR_SORTEO' : 'CREAR_SORTEO', id);
  return {ok:true, raffle:{id:id}};
}

function adminDuplicateRaffle_(data) {
  const session = requireSession_(data.token, '*');
  const source = raffleById_(data.raffleId);
  if (!source) throw new Error('Sorteo no encontrado.');
  const newId = source.id + '-COPIA-' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMddHHmm');
  const sheet = requiredSheet_(db_(), APP.SHEETS.RAFFLES);
  sheet.appendRow([
    newId,source.name + ' (Copia)',source.description,source.drawDate,source.ticketPrice,
    source.currency,source.totalTickets,'PAUSADO',source.imageUrl,'',
    '',0,'NO',new Date()
  ]);
  const prizeSheet = requiredSheet_(db_(), APP.SHEETS.PRIZES);
  prizesByRaffle_(source.id).forEach(function(prize) {
    prizeSheet.appendRow([
      prize.id + '-COPIA-' + Utilities.formatDate(new Date(), APP.TZ, 'HHmmss'),
      newId,prize.order,prize.name,prize.description,prize.imageUrl,'PENDIENTE','','NO',new Date()
    ]);
  });
  syncNumbersForRaffle_(newId, source.totalTickets, session.username);
  saveRaffleConfig_(newId, raffleConfigMap_(source.id));
  logAction_(session, 'DUPLICAR_SORTEO', source.id + ' -> ' + newId);
  return {ok:true, raffleId:newId};
}

function adminSavePrize_(data) {
  const session = requireSession_(data.token, '*');
  const input = parseJson_(data.prize);
  if (!normalize_(input.raffleId)) throw new Error('Selecciona el sorteo.');
  if (!normalize_(input.name)) throw new Error('Escribe el nombre del premio.');
  const sheet = requiredSheet_(db_(), APP.SHEETS.PRIZES);
  const existing = normalize_(input.id) ? prizeById_(input.id) : null;
  const id = existing ? existing.id : 'PREMIO-' + Utilities.getUuid().replace(/-/g,'').slice(0,10).toUpperCase();
  const row = [
    id, normalize_(input.raffleId), Math.max(1,Number(input.order||1)),
    normalize_(input.name), normalize_(input.description), normalize_(input.imageUrl),
    normalize_(input.status||'PENDIENTE'), existing?existing.winnerTicket:'',
    existing?existing.published:'NO', new Date()
  ];
  if (existing) sheet.getRange(existing.row,1,1,HEADERS.PRIZES.length).setValues([row]);
  else sheet.appendRow(row);
  logAction_(session, existing?'EDITAR_PREMIO':'CREAR_PREMIO', id);
  return {ok:true,id:id};
}

function adminDeletePrize_(data) {
  const session = requireSession_(data.token, '*');
  const prize = prizeById_(data.prizeId);
  if (!prize) throw new Error('Premio no encontrado.');
  if (resultByPrize_(prize.id)) throw new Error('No se puede desactivar un premio ya sorteado.');
  const sheet = requiredSheet_(db_(),APP.SHEETS.PRIZES);
  sheet.getRange(prize.row,7).setValue('DESACTIVADO');
  sheet.getRange(prize.row,9).setValue('NO');
  sheet.getRange(prize.row,10).setValue(new Date());
  logAction_(session,'DESACTIVAR_PREMIO',prize.id);
  return {ok:true};
}

function adminSetActiveRaffle_(data) {
  const session = requireSession_(data.token, '*');
  const raffle = raffleById_(data.raffleId);
  if (!raffle) throw new Error('Sorteo no encontrado.');
  setConfigValue_('SORTEO_ACTIVO',raffle.id,'Sorteo mostrado por defecto');
  logAction_(session,'CAMBIAR_SORTEO_ACTIVO',raffle.id);
  return {ok:true,raffleId:raffle.id};
}

function adminDashboard_(data) {
  const session = requireSession_(data.token, 'DASHBOARD');
  releaseExpiredReservations_(data.raffleId);
  const raffle = raffleById_(data.raffleId);
  if (!raffle) throw new Error('Sorteo no encontrado.');
  const numbers = numberRows_(data.raffleId).filter(function(item){return Number(item.number)<raffle.totalTickets;});
  const participants = groupParticipants_(data.raffleId, '', '');
  const approved = participants.filter(function(item){return item.status===PAYMENT_STATUS.APPROVED;});
  const stats = numberStats_(numbers);
  const cityMap = countBy_(participants, 'city');
  const methodMap = countBy_(participants, 'paymentMethod');

  return {
    ok:true,
    stats:{
      revenue:stats.sold * raffle.ticketPrice,currency:raffle.currency,sold:stats.sold,
      available:stats.available,pendingPayments:participants.filter(function(item){return [PAYMENT_STATUS.PENDING,PAYMENT_STATUS.RECEIVED,PAYMENT_STATUS.REVIEW].indexOf(item.status)>=0;}).length,
      approvedPayments:approved.length,participants:participants.length,
      percent:stats.total?Math.round(stats.sold/stats.total*100):0,
      numberStatuses:{
        Disponible:stats.available,Reservado:stats.reserved,'En revisión':stats.review,Vendido:stats.sold,Bloqueado:stats.blocked
      }
    },
    cities:mapToItems_(cityMap),
    methods:mapToItems_(methodMap),
    audit:auditRows_(12)
  };
}


function adminOrders_(data) {
  requireSession_(data.token, 'PARTICIPANTS_READ');
  const orders = groupParticipants_(data.raffleId, normalize_(data.search), normalize_(data.status));
  orders.sort(function(a,b){
    return Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0);
  });
  return {ok:true, orders:orders};
}

function adminOrderStatus_(data) {
  const session = requireSession_(data.token, 'PAYMENTS');
  const code = normalize_(data.participationCode || data.code);
  const target = normalize_(data.status || data.ticketStatus).toUpperCase();
  const rows = participantRows_().filter(function(item){return item.code===code;});
  if (!rows.length) throw new Error('Pedido no encontrado.');
  const participantSheet = requiredSheet_(db_(), APP.SHEETS.PARTICIPANTS);
  const numberSheet = requiredSheet_(db_(), APP.SHEETS.NUMBERS);
  const numberMap = numberRowMap_(rows[0].raffleId);
  const cfg = raffleConfigMap_(rows[0].raffleId);
  const now = new Date();
  let paymentStatus = PAYMENT_STATUS.REVIEW;
  let numberStatus = NUMBER_STATUS.REVIEW;
  let expiresAt = '';
  if (target === NUMBER_STATUS.AVAILABLE) {
    paymentStatus = PAYMENT_STATUS.REJECTED; numberStatus = NUMBER_STATUS.AVAILABLE;
  } else if (target === NUMBER_STATUS.RESERVED) {
    paymentStatus = PAYMENT_STATUS.PENDING; numberStatus = NUMBER_STATUS.RESERVED;
    expiresAt = new Date(now.getTime() + cfg.reservationMinutes * 60000);
  } else if (target === NUMBER_STATUS.SOLD) {
    paymentStatus = PAYMENT_STATUS.APPROVED; numberStatus = NUMBER_STATUS.SOLD;
  } else if (target === NUMBER_STATUS.BLOCKED) {
    paymentStatus = PAYMENT_STATUS.REVIEW; numberStatus = NUMBER_STATUS.BLOCKED;
  } else if (target !== NUMBER_STATUS.REVIEW) {
    throw new Error('Estado no permitido.');
  }
  rows.forEach(function(item){
    participantSheet.getRange(item.row,10).setValue(paymentStatus);
    participantSheet.getRange(item.row,13).setValue(normalize_(data.notes));
    participantSheet.getRange(item.row,14).setValue(expiresAt);
    participantSheet.getRange(item.row,15).setValue(session.username);
    participantSheet.getRange(item.row,16).setValue(now);
    const numberItem = numberMap[item.ticket];
    if (numberItem) numberSheet.getRange(numberItem.row,3,1,6).setValues([[numberStatus, numberStatus===NUMBER_STATUS.AVAILABLE?'':code, expiresAt, normalize_(data.notes), session.username, now]]);
  });
  logAction_(session,'CAMBIAR_ESTADO_PEDIDO',code+' | '+target);
  return {ok:true,status:target};
}

function adminParticipants_(data) {
  requireSession_(data.token, 'PARTICIPANTS_READ');
  const items = groupParticipants_(data.raffleId, normalize_(data.search), normalize_(data.status));
  return {ok:true, participants:items};
}

function adminUpdateParticipant_(data) {
  const session = requireSession_(data.token, 'PARTICIPANTS_WRITE');
  const input = parseJson_(data.participant);
  const rows = participantRows_().filter(function(item){return item.code===input.code;});
  if (!rows.length) throw new Error('Participante no encontrado.');
  const sheet = requiredSheet_(db_(), APP.SHEETS.PARTICIPANTS);
  rows.forEach(function(item) {
    sheet.getRange(item.row,4).setValue(normalize_(input.fullName));
    sheet.getRange(item.row,5).setValue(normalizePhoneDisplay_(input.phone));
    sheet.getRange(item.row,6).setValue(normalize_(input.email));
    sheet.getRange(item.row,7).setValue(normalize_(input.city));
    sheet.getRange(item.row,8).setValue(normalize_(input.identityNumber));
    sheet.getRange(item.row,13).setValue(normalize_(input.notes));
    sheet.getRange(item.row,16).setValue(new Date());
  });
  logAction_(session, 'EDITAR_PARTICIPANTE', input.code);
  return {ok:true};
}

function adminPaymentDecision_(data) {
  const session = requireSession_(data.token, 'PAYMENTS');
  const decision = normalize_(data.decision).toUpperCase();
  if ([PAYMENT_STATUS.REVIEW,PAYMENT_STATUS.APPROVED,PAYMENT_STATUS.REJECTED].indexOf(decision)<0) {
    throw new Error('Decisión no válida.');
  }
  const rows = participantRows_().filter(function(item){return item.code===data.participationCode;});
  if (!rows.length) throw new Error('Participación no encontrada.');
  const participantSheet = requiredSheet_(db_(), APP.SHEETS.PARTICIPANTS);
  const numberSheet = requiredSheet_(db_(), APP.SHEETS.NUMBERS);
  const numberMap = numberRowMap_(rows[0].raffleId);
  const now = new Date();

  rows.forEach(function(item) {
    participantSheet.getRange(item.row,10).setValue(decision);
    participantSheet.getRange(item.row,13).setValue(normalize_(data.notes));
    participantSheet.getRange(item.row,15).setValue(decision===PAYMENT_STATUS.APPROVED?session.username:'');
    participantSheet.getRange(item.row,16).setValue(now);
    const numberItem = numberMap[item.ticket];
    if (!numberItem) return;
    let numberStatus = NUMBER_STATUS.REVIEW;
    if (decision===PAYMENT_STATUS.APPROVED) numberStatus=NUMBER_STATUS.SOLD;
    if (decision===PAYMENT_STATUS.REJECTED) numberStatus=NUMBER_STATUS.AVAILABLE;
    numberSheet.getRange(numberItem.row,3,1,6).setValues([[
      numberStatus,
      decision===PAYMENT_STATUS.REJECTED?'':item.code,
      '',
      normalize_(data.notes),
      session.username,
      now
    ]]);
  });
  logAction_(session, 'DECISION_PAGO', data.participationCode + ' | ' + decision);
  return {ok:true};
}

function adminBoard_(data) {
  requireSession_(data.token, 'DASHBOARD');
  releaseExpiredReservations_(data.raffleId);
  const raffle = raffleById_(data.raffleId);
  const participantMap = {};
  participantRows_(data.raffleId).forEach(function(item) {
    participantMap[item.code] = item.fullName + ' · ' + item.phone;
  });
  const tickets = numberRows_(data.raffleId)
    .filter(function(item){return Number(item.number)<raffle.totalTickets;})
    .map(function(item){return {number:item.number,status:item.status,owner:participantMap[item.code]||item.notes||''};});
  return {ok:true,tickets:tickets,stats:numberStats_(numberRows_(data.raffleId))};
}

function adminNumberAction_(data) {
  const session = requireSession_(data.token, 'NUMBERS');
  const action = normalize_(data.numberAction).toUpperCase();
  const raffle = raffleById_(data.raffleId);
  const ticket = normalizeTickets_([data.number], raffle.totalTickets)[0];
  const numberItem = numberRowMap_(raffle.id)[ticket];
  if (!numberItem) throw new Error('Número no encontrado.');
  const numberSheet = requiredSheet_(db_(), APP.SHEETS.NUMBERS);
  const participantSheet = requiredSheet_(db_(), APP.SHEETS.PARTICIPANTS);
  const now = new Date();

  if (action==='BLOCK') {
    if (numberItem.status===NUMBER_STATUS.SOLD) throw new Error('No se puede bloquear un número vendido.');
    numberSheet.getRange(numberItem.row,3,1,6).setValues([[NUMBER_STATUS.BLOCKED,'','',normalize_(data.notes),session.username,now]]);
  } else if (action==='RELEASE') {
    const linked = participantRows_(raffle.id).filter(function(item){return item.ticket===ticket && item.paymentStatus!==PAYMENT_STATUS.APPROVED;});
    linked.forEach(function(item){
      participantSheet.getRange(item.row,10).setValue(PAYMENT_STATUS.REJECTED);
      participantSheet.getRange(item.row,13).setValue('Liberado manualmente: '+normalize_(data.notes));
      participantSheet.getRange(item.row,16).setValue(now);
    });
    numberSheet.getRange(numberItem.row,3,1,6).setValues([[NUMBER_STATUS.AVAILABLE,'','','Liberado manualmente',session.username,now]]);
  } else if (action==='ASSIGN') {
    if (numberItem.status===NUMBER_STATUS.SOLD) throw new Error('El número ya está vendido.');
    const person = parseJson_(data.participant);
    if (!person.fullName || !person.phone) throw new Error('Nombre y WhatsApp son obligatorios.');
    const code = 'MANUAL-' + Utilities.formatDate(now,APP.TZ,'yyyyMMdd-HHmmss');
    participantSheet.appendRow([
      now,raffle.id,ticket,normalize_(person.fullName),normalizePhoneDisplay_(person.phone),
      normalize_(person.email),normalize_(person.city),normalize_(person.identityNumber),
      'MANUAL',PAYMENT_STATUS.APPROVED,code,'',normalize_(data.notes),'',session.username,now
    ]);
    numberSheet.getRange(numberItem.row,3,1,6).setValues([[NUMBER_STATUS.SOLD,code,'',normalize_(data.notes),session.username,now]]);
  } else {
    throw new Error('Acción no válida.');
  }
  logAction_(session, 'ACCION_NUMERO', raffle.id+' | '+ticket+' | '+action);
  return {ok:true};
}


function adminBulkNumberAction_(data) {
  const session=requireSession_(data.token,'NUMBERS');
  const raffle=raffleById_(data.raffleId);
  if(!raffle)throw new Error('Sorteo no encontrado.');
  const action=normalize_(data.numberAction).toUpperCase();
  if(['BLOCK','RELEASE'].indexOf(action)<0)throw new Error('Acción no válida.');
  const tickets=normalizeTickets_(data.numbers,raffle.totalTickets);
  const numberSheet=requiredSheet_(db_(),APP.SHEETS.NUMBERS);
  const participantSheet=requiredSheet_(db_(),APP.SHEETS.PARTICIPANTS);
  const map=numberRowMap_(raffle.id);const now=new Date();const changed=[];const skipped=[];
  tickets.forEach(function(ticket){
    const item=map[ticket];if(!item){skipped.push(ticket);return;}
    if(action==='BLOCK'){
      if(item.status===NUMBER_STATUS.SOLD){skipped.push(ticket);return;}
      numberSheet.getRange(item.row,3,1,6).setValues([[NUMBER_STATUS.BLOCKED,'','',normalize_(data.notes),session.username,now]]);
      changed.push(ticket);return;
    }
    participantRows_(raffle.id).filter(function(p){return p.ticket===ticket&&p.paymentStatus!==PAYMENT_STATUS.APPROVED;}).forEach(function(p){participantSheet.getRange(p.row,10).setValue(PAYMENT_STATUS.REJECTED);participantSheet.getRange(p.row,13).setValue('Liberado masivamente: '+normalize_(data.notes));participantSheet.getRange(p.row,16).setValue(now);});
    numberSheet.getRange(item.row,3,1,6).setValues([[NUMBER_STATUS.AVAILABLE,'','','Liberado masivamente',session.username,now]]);changed.push(ticket);
  });
  logAction_(session,'ACCION_MASIVA_NUMEROS',raffle.id+' | '+action+' | '+changed.join(', '));
  return {ok:true,changed:changed,skipped:skipped};
}

function adminReleaseReservations_(data) {
  const session=requireSession_(data.token,'NUMBERS');
  const count=releaseExpiredReservations_(data.raffleId);
  logAction_(session,'LIBERAR_RESERVAS_VENCIDAS',normalize_(data.raffleId)+' | '+count);
  return {ok:true,released:count};
}


/**
 * SORTEOS EN VIVO
 * Migra los tickets aprobados, selecciona un ganador entre tickets vendidos,
 * revela el número dígito por dígito y registra el resultado al completar.
 */
function adminLiveDrawSetup_(data) {
  requireSession_(data.token, 'RESULTS');

  const raffle = raffleById_(data.raffleId);
  if (!raffle) throw new Error('Sorteo no encontrado.');

  const participantRows = participantRows_(raffle.id);
  const approvedRows = participantRows.filter(function(item) {
    return item.paymentStatus === PAYMENT_STATUS.APPROVED;
  });
  const numberRows = numberRows_(raffle.id);
  const soldRows = numberRows.filter(function(item) {
    return item.status === NUMBER_STATUS.SOLD;
  });
  const numberMap = {};
  numberRows.forEach(function(item) { numberMap[item.number] = item; });

  const approvedNotSold = approvedRows.filter(function(item) {
    return !numberMap[item.ticket] || numberMap[item.ticket].status !== NUMBER_STATUS.SOLD;
  });

  const approvedTicketSet = new Set(approvedRows.map(function(item) { return item.ticket; }));
  const soldWithoutApproved = soldRows.filter(function(item) {
    return !approvedTicketSet.has(item.number);
  });

  const eligible = eligibleLiveTickets_(raffle.id);
  const prizes = prizesByRaffle_(raffle.id)
    .filter(function(item) { return item.status !== 'DESACTIVADO'; })
    .sort(sortByOrder_)
    .map(function(item) {
      const result = resultByPrize_(item.id);
      return {
        id: item.id,
        order: item.order,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        status: item.status,
        drawn: Boolean(result),
        winnerTicket: result ? result.ticket : ''
      };
    });

  return {
    ok: true,
    raffle: {
      id: raffle.id,
      name: raffle.name,
      totalTickets: raffle.totalTickets,
      digitCount: Math.max(3, String(Math.max(1, raffle.totalTickets)).length),
      status: raffle.status,
      drawDate: displayDate_(raffle.drawDate),
      liveBackgroundUrl: publicImageUrl_(raffleConfigMap_(raffle.id).liveBackgroundUrl, 'assets/sorteos-en-vivo-utopia.png')
    },
    stats: {
      participantRows: participantRows.length,
      approvedTickets: approvedRows.length,
      soldTickets: soldRows.length,
      eligibleTickets: eligible.length,
      approvedNotSold: approvedNotSold.length,
      soldWithoutApproved: soldWithoutApproved.length
    },
    prizes: prizes,
    winners: liveDrawWinnerRows_(raffle.id)
  };
}

function adminLiveDrawSync_(data) {
  const session = requireSession_(data.token, 'RESULTS');
  const raffle = raffleById_(data.raffleId);
  if (!raffle) throw new Error('Sorteo no encontrado.');

  syncNumbersForRaffle_(raffle.id, raffle.totalTickets, session.username);

  const participantRows = participantRows_(raffle.id).filter(function(item) {
    return item.paymentStatus === PAYMENT_STATUS.APPROVED;
  });
  const numberSheet = requiredSheet_(db_(), APP.SHEETS.NUMBERS);
  const numberMap = numberRowMap_(raffle.id);
  const now = new Date();
  let synchronized = 0;
  let alreadySold = 0;
  const missing = [];

  participantRows.forEach(function(item) {
    const numberItem = numberMap[item.ticket];
    if (!numberItem) {
      missing.push(item.ticket);
      return;
    }
    if (numberItem.status === NUMBER_STATUS.SOLD && numberItem.code === item.code) {
      alreadySold++;
      return;
    }
    numberSheet.getRange(numberItem.row, 3, 1, 6).setValues([[
      NUMBER_STATUS.SOLD,
      item.code,
      '',
      'Migrado a Sorteos en vivo desde pago aprobado',
      session.username,
      now
    ]]);
    synchronized++;
  });

  SpreadsheetApp.flush();
  logAction_(session, 'MIGRAR_TICKETS_SORTEO_EN_VIVO',
    raffle.id + ' | SINCRONIZADOS: ' + synchronized + ' | YA_VENDIDOS: ' + alreadySold);

  const setup = adminLiveDrawSetup_({token:data.token, raffleId:raffle.id});
  setup.migration = {
    synchronized: synchronized,
    alreadySold: alreadySold,
    missingNumberRows: missing
  };
  return setup;
}

function adminLiveDrawStart_(data) {
  const session = requireSession_(data.token, 'RESULTS');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const raffle = raffleById_(data.raffleId);
    const prize = prizeById_(data.prizeId);
    if (!raffle) throw new Error('Sorteo no encontrado.');
    if (!prize || prize.raffleId !== raffle.id) throw new Error('Premio no encontrado.');
    if (resultByPrize_(prize.id)) throw new Error('Este premio ya tiene un ganador registrado.');

    const eligible = eligibleLiveTickets_(raffle.id);
    if (!eligible.length) {
      throw new Error('No existen tickets vendidos y aprobados elegibles. Primero migra los tickets.');
    }

    const randomIndex = secureRandomIndex_(eligible.length);
    const winner = eligible[randomIndex];
    const digitCount = Math.max(3, String(Math.max(1, raffle.totalTickets)).length);
    const ticket = String(winner.ticket).padStart(digitCount, '0');
    const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    const controlCode = 'UT-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    const drawSession = {
      token: token,
      username: session.username,
      role: session.role,
      raffleId: raffle.id,
      raffleName: raffle.name,
      prizeId: prize.id,
      prizeName: prize.name,
      prizeOrder: prize.order,
      ticket: ticket,
      fullName: winner.fullName,
      phone: winner.phone,
      city: winner.city,
      code: winner.code,
      revealed: 0,
      digitCount: digitCount,
      eligibleCount: eligible.length,
      controlCode: controlCode,
      createdAt: new Date().toISOString()
    };

    CacheService.getScriptCache().put(
      'LIVE_DRAW_' + token,
      JSON.stringify(drawSession),
      3600
    );

    logAction_(session, 'INICIAR_SORTEO_EN_VIVO',
      raffle.id + ' | ' + prize.id + ' | ELEGIBLES: ' + eligible.length + ' | CONTROL: ' + controlCode);

    return {
      ok: true,
      drawToken: token,
      controlCode: controlCode,
      digitCount: digitCount,
      eligibleCount: eligible.length,
      prize: {id:prize.id, order:prize.order, name:prize.name},
      raffle: {id:raffle.id, name:raffle.name},
      nextDigitIndex: 0
    };
  } finally {
    lock.releaseLock();
  }
}

function adminLiveDrawReveal_(data) {
  const session = requireSession_(data.token, 'RESULTS');
  const cache = CacheService.getScriptCache();
  const cacheKey = 'LIVE_DRAW_' + normalize_(data.drawToken);
  const raw = cache.get(cacheKey);
  if (!raw) throw new Error('La sesión del sorteo en vivo venció o fue cancelada.');

  const draw = JSON.parse(raw);
  if (draw.username !== session.username && session.role !== ROLES.ADMIN) {
    throw new Error('Este sorteo en vivo pertenece a otra sesión.');
  }
  if (resultByPrize_(draw.prizeId)) {
    cache.remove(cacheKey);
    throw new Error('Este premio ya tiene un ganador registrado.');
  }
  if (draw.revealed >= draw.digitCount) {
    throw new Error('El número ya fue completado.');
  }

  const index = draw.revealed;
  const digit = draw.ticket.charAt(index);
  draw.revealed++;
  const completed = draw.revealed >= draw.digitCount;

  if (!completed) {
    cache.put(cacheKey, JSON.stringify(draw), 3600);
    logAction_(session, 'DETENER_DIGITO_SORTEO_EN_VIVO',
      draw.controlCode + ' | POSICION: ' + (index + 1));
    return {
      ok: true,
      completed: false,
      index: index,
      digit: digit,
      revealed: draw.revealed,
      digitCount: draw.digitCount,
      nextDigitIndex: draw.revealed,
      controlCode: draw.controlCode
    };
  }

  const result = finalizeLiveDraw_(draw, session);
  cache.remove(cacheKey);
  return {
    ok: true,
    completed: true,
    index: index,
    digit: digit,
    revealed: draw.revealed,
    digitCount: draw.digitCount,
    controlCode: draw.controlCode,
    winner: result
  };
}

function adminLiveDrawCancel_(data) {
  const session = requireSession_(data.token, 'RESULTS');
  const key = 'LIVE_DRAW_' + normalize_(data.drawToken);
  CacheService.getScriptCache().remove(key);
  logAction_(session, 'CANCELAR_SORTEO_EN_VIVO', normalize_(data.drawToken).slice(0, 12));
  return {ok:true};
}

function finalizeLiveDraw_(draw, session) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const prize = prizeById_(draw.prizeId);
    if (!prize || prize.raffleId !== draw.raffleId) throw new Error('Premio no encontrado.');
    if (resultByPrize_(prize.id)) throw new Error('Este premio ya tiene un ganador registrado.');

    const eligible = eligibleLiveTickets_(draw.raffleId);
    const winner = eligible.find(function(item) {
      return item.ticket === draw.ticket && item.code === draw.code;
    });
    if (!winner) throw new Error('El ticket dejó de ser elegible antes de completar el sorteo.');

    const now = new Date();
    const resultId = 'RES-' + Utilities.getUuid().slice(0,8).toUpperCase();
    const copies = winnerCopies_(prize, winner);
    const resultSheet = requiredSheet_(db_(), APP.SHEETS.RESULTS);
    resultSheet.appendRow([
      resultId, draw.raffleId, prize.id, prize.order, prize.name, winner.ticket,
      winner.fullName, winner.city, winner.code, now, session.username, 'NO', 'SI',
      copies.facebook, copies.instagram, copies.whatsapp
    ]);

    const prizeSheet = requiredSheet_(db_(), APP.SHEETS.PRIZES);
    prizeSheet.getRange(prize.row, 7).setValue('SORTEADO');
    prizeSheet.getRange(prize.row, 8).setValue(winner.ticket);
    prizeSheet.getRange(prize.row, 9).setValue('NO');
    prizeSheet.getRange(prize.row, 10).setValue(now);

    logAction_(session, 'COMPLETAR_SORTEO_EN_VIVO',
      draw.controlCode + ' | ' + prize.id + ' | ' + winner.ticket + ' | ' + winner.fullName);

    return {
      resultId: resultId,
      ticket: winner.ticket,
      fullName: winner.fullName,
      maskedPhone: maskPhoneForDisplay_(winner.phone),
      callPhone: phoneForLink_(winner.phone),
      city: winner.city,
      participationCode: winner.code,
      prizeId: prize.id,
      prizeName: prize.name,
      prizeOrder: prize.order,
      drawDate: displayDate_(now),
      controlCode: draw.controlCode
    };
  } finally {
    lock.releaseLock();
  }
}

function eligibleLiveTickets_(raffleId) {
  const numberMap = numberRowMap_(raffleId);
  const previous = new Set(resultRows_(raffleId).map(function(item) { return item.ticket; }));
  const allowRepeat = String(configMap_().PERMITIR_NUMERO_REPETIDO || 'NO').toUpperCase() === 'SI';
  const unique = {};

  participantRows_(raffleId)
    .filter(function(item) {
      return item.paymentStatus === PAYMENT_STATUS.APPROVED;
    })
    .forEach(function(item) {
      const numberItem = numberMap[item.ticket];
      if (!numberItem || numberItem.status !== NUMBER_STATUS.SOLD) return;
      if (!allowRepeat && previous.has(item.ticket)) return;
      if (!unique[item.ticket]) unique[item.ticket] = item;
    });

  return Object.keys(unique)
    .sort(function(a,b){ return Number(a) - Number(b); })
    .map(function(ticket){ return unique[ticket]; });
}

function liveDrawWinnerRows_(raffleId) {
  return resultRows_(raffleId)
    .sort(sortByOrder_)
    .map(function(result) {
      const participant = participantRows_(raffleId).find(function(item) {
        return item.code === result.participationCode && item.ticket === result.ticket;
      }) || participantRows_(raffleId).find(function(item) {
        return item.ticket === result.ticket;
      });
      return {
        id: result.id,
        prizeId: result.prizeId,
        prizeOrder: result.order,
        prizeName: result.prizeName,
        ticket: result.ticket,
        fullName: result.fullName,
        city: result.city,
        maskedPhone: maskPhoneForDisplay_(participant ? participant.phone : ''),
        callPhone: phoneForLink_(participant ? participant.phone : ''),
        drawDate: displayDate_(result.drawDate),
        published: result.published === 'SI'
      };
    });
}

function secureRandomIndex_(length) {
  if (length <= 1) return 0;
  const seed = Utilities.getUuid() + '|' + new Date().getTime() + '|' + Math.random();
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    seed,
    Utilities.Charset.UTF_8
  );
  let value = 0;
  for (let i = 0; i < 6; i++) {
    value = (value * 256) + (bytes[i] < 0 ? bytes[i] + 256 : bytes[i]);
  }
  return value % length;
}

function maskPhoneForDisplay_(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.indexOf('591') === 0 && digits.length > 8) digits = digits.slice(3);
  if (digits.length <= 5) return digits || 'No registrado';
  return digits.slice(0, 3) + 'XXXX' + digits.slice(-2);
}

function phoneForLink_(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 8) digits = '591' + digits;
  return digits;
}

function adminDrawPreview_(data) {
  const session = requireSession_(data.token, 'RESULTS');
  const raffle = raffleById_(data.raffleId);
  const eligible = eligibleTickets_(data.raffleId, data.prizeId);
  const participants = groupParticipants_(data.raffleId,'','');
  return {
    ok:true,raffleCode:raffle.id,participants:participants.length,
    sold:numberStats_(numberRows_(data.raffleId)).sold,eligible:eligible.length,
    drawDate:Utilities.formatDate(new Date(),APP.TZ,'dd/MM/yyyy HH:mm:ss'),
    responsible:session.name+' ('+session.username+')'
  };
}

function adminDraw_(data) {
  const session = requireSession_(data.token, 'RESULTS');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const prize = prizeById_(data.prizeId);
    if (!prize || prize.raffleId!==data.raffleId) throw new Error('Premio no encontrado.');
    if (resultByPrize_(prize.id)) throw new Error('Este premio ya tiene un resultado bloqueado.');
    const eligible = eligibleTickets_(data.raffleId, prize.id);
    if (!eligible.length) throw new Error('No existen números aprobados elegibles.');

    const winner = eligible[Math.floor(Math.random()*eligible.length)];
    const now = new Date();
    const resultId = 'RES-' + Utilities.getUuid().slice(0,8).toUpperCase();
    const copies = winnerCopies_(prize, winner);
    const sheet = requiredSheet_(db_(), APP.SHEETS.RESULTS);
    sheet.appendRow([
      resultId,data.raffleId,prize.id,prize.order,prize.name,winner.ticket,
      winner.fullName,winner.city,winner.code,now,session.username,'NO','SI',
      copies.facebook,copies.instagram,copies.whatsapp
    ]);
    const prizeSheet = requiredSheet_(db_(), APP.SHEETS.PRIZES);
    prizeSheet.getRange(prize.row,7).setValue('SORTEADO');
    prizeSheet.getRange(prize.row,8).setValue(winner.ticket);
    prizeSheet.getRange(prize.row,9).setValue('NO');
    prizeSheet.getRange(prize.row,10).setValue(now);
    logAction_(session, 'REALIZAR_SORTEO', prize.id+' | '+winner.ticket+' | '+winner.fullName);
    return {ok:true,winner:{ticket:winner.ticket,fullName:winner.fullName,city:winner.city,code:winner.code}};
  } finally {
    lock.releaseLock();
  }
}

function adminResults_(data) {
  requireSession_(data.token, 'DASHBOARD');
  return {ok:true,results:resultRows_(data.raffleId).sort(sortByOrder_).map(adminResult_)};
}

function adminPublishResult_(data) {
  const session = requireSession_(data.token, 'PUBLISH');
  const result = resultById_(data.resultId);
  if (!result) throw new Error('Resultado no encontrado.');
  const value = String(data.published).toLowerCase()==='true'?'SI':'NO';
  const sheet = requiredSheet_(db_(), APP.SHEETS.RESULTS);
  sheet.getRange(result.row,12).setValue(value);
  const prize = prizeById_(result.prizeId);
  requiredSheet_(db_(), APP.SHEETS.PRIZES).getRange(prize.row,9).setValue(value);
  logAction_(session, value==='SI'?'PUBLICAR_GANADOR':'OCULTAR_GANADOR', result.id);
  return {ok:true};
}

function adminReport_(data) {
  requireSession_(data.token, 'REPORTS');
  const raffle = raffleById_(data.raffleId);
  const participants = groupParticipants_(data.raffleId,'','');
  const numbers = numberStats_(numberRows_(data.raffleId));
  const approved = participants.filter(function(item){return item.status===PAYMENT_STATUS.APPROVED;});
  const revenue = numbers.sold * raffle.ticketPrice;
  return {
    ok:true,
    summary:{
      'Total recaudado':formatMoneyText_(revenue,raffle.currency),
      'Números vendidos':String(numbers.sold),
      'Números disponibles':String(numbers.available),
      'Pagos pendientes':String(participants.filter(function(item){return [PAYMENT_STATUS.PENDING,PAYMENT_STATUS.RECEIVED,PAYMENT_STATUS.REVIEW].indexOf(item.status)>=0;}).length),
      'Pagos aprobados':String(approved.length),
      'Participantes':String(participants.length),
      'Porcentaje de avance':(numbers.total?Math.round(numbers.sold/numbers.total*100):0)+'%',
      'Meta económica':formatMoneyText_(raffle.goalAmount,raffle.currency),
      'Recaudación neta':formatMoneyText_(revenue,raffle.currency)
    },
    numberStatuses:mapToItems_({DISPONIBLE:numbers.available,RESERVADO:numbers.reserved,EN_REVISION:numbers.review,VENDIDO:numbers.sold,BLOQUEADO:numbers.blocked}),
    paymentStatuses:mapToItems_(countBy_(participants,'status')),
    departments:mapToItems_(countBy_(participants,'city')),
    paymentMethods:mapToItems_(countBy_(participants,'paymentMethod')),
    participants:participants
  };
}

function adminUsers_(data) {
  requireSession_(data.token, '*');
  return {ok:true,users:userRows_().map(function(item){
    return {username:item.username,name:item.name,email:item.email,role:item.role,status:item.status,lastLogin:iso_(item.lastLogin)};
  })};
}

function adminCreateUser_(data) {
  const session = requireSession_(data.token, '*');
  const input = parseJson_(data.user);
  const username = normalizeUsername_(input.username);
  if (!username || !input.name || String(input.password||'').length<8) throw new Error('Completa los datos y usa una contraseña de al menos 8 caracteres.');
  if (findUser_(username)) throw new Error('Ese usuario ya existe.');
  if ([ROLES.ADMIN,ROLES.OPERATOR,ROLES.FINANCE,ROLES.COMMS,ROLES.AUDITOR].indexOf(input.role)<0) throw new Error('Rol no válido.');
  const salt = Utilities.getUuid();
  requiredSheet_(db_(),APP.SHEETS.USERS).appendRow([
    username,normalize_(input.name),normalize_(input.email),input.role,salt,
    hashPassword_(input.password,salt),'ACTIVO','',new Date()
  ]);
  logAction_(session,'CREAR_USUARIO',username+' | '+input.role);
  return {ok:true};
}

function adminResetPassword_(data) {
  const session = requireSession_(data.token, '*');
  if (String(data.password||'').length<8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  const user = findUser_(data.username);
  if (!user) throw new Error('Usuario no encontrado.');
  const salt = Utilities.getUuid();
  const sheet = requiredSheet_(db_(),APP.SHEETS.USERS);
  sheet.getRange(user.row,5).setValue(salt);
  sheet.getRange(user.row,6).setValue(hashPassword_(data.password,salt));
  logAction_(session,'RESTABLECER_CONTRASENA',user.username);
  return {ok:true};
}


function adminUpdateUserRole_(data) {
  const session=requireSession_(data.token,'*');
  const user=findUser_(data.username);if(!user)throw new Error('Usuario no encontrado.');
  const role=normalize_(data.role).toUpperCase();
  if(Object.keys(ROLE_PERMISSIONS).indexOf(role)<0)throw new Error('Rol no válido.');
  if(user.username===session.username&&role!==ROLES.ADMIN)throw new Error('No puedes quitarte tu propio rol de administrador.');
  requiredSheet_(db_(),APP.SHEETS.USERS).getRange(user.row,4).setValue(role);
  logAction_(session,'CAMBIAR_ROL_USUARIO',user.username+' | '+role);
  return {ok:true,role:role};
}

function adminChangePassword_(data) {
  const session = requireSession_(data.token);
  const user = findUser_(session.username);
  if (!user || hashPassword_(data.currentPassword,user.salt)!==user.passwordHash) throw new Error('La contraseña actual no es correcta.');
  if (String(data.newPassword||'').length<8) throw new Error('La nueva contraseña debe tener al menos 8 caracteres.');
  const salt = Utilities.getUuid();
  const sheet = requiredSheet_(db_(),APP.SHEETS.USERS);
  sheet.getRange(user.row,5).setValue(salt);
  sheet.getRange(user.row,6).setValue(hashPassword_(data.newPassword,salt));
  CacheService.getScriptCache().remove('SESSION_'+data.token);
  logAction_(session,'CAMBIAR_CONTRASENA','');
  return {ok:true};
}

function adminAudit_(data) {
  requireSession_(data.token,'AUDIT');
  return {ok:true,audit:auditRows_(100)};
}


/* ======================== CONTENIDO Y OPERACIONES EXTRA ======================== */

function adminSaveImpact_(data) {
  const session = requireSession_(data.token, 'PUBLISH');
  const input = parseJson_(data.item);
  if (!normalize_(input.raffleId) || !normalize_(input.title)) throw new Error('Completa el título del contenido.');
  const sheet = requiredSheet_(db_(), APP.SHEETS.CONTENT);
  const id = normalize_(input.id) || ('IMPACT-' + Utilities.getUuid().slice(0,8).toUpperCase());
  const existing = impactRows_().find(function(item){return item.id===id;});
  const row = [id,normalize_(input.raffleId),Number(input.order||1),normalize_(input.title),normalize_(input.text),normalize_(input.imageUrl),input.active===false?'NO':'SI',new Date()];
  if (existing) sheet.getRange(existing.row,1,1,row.length).setValues([row]); else sheet.appendRow(row);
  logAction_(session,'GUARDAR_CONTENIDO_PUBLICO',id);
  return {ok:true,id:id};
}

function adminDeleteImpact_(data) {
  const session = requireSession_(data.token, 'PUBLISH');
  const item = impactRows_().find(function(row){return row.id===normalize_(data.id);});
  if (!item) throw new Error('Contenido no encontrado.');
  requiredSheet_(db_(),APP.SHEETS.CONTENT).getRange(item.row,7).setValue('NO');
  requiredSheet_(db_(),APP.SHEETS.CONTENT).getRange(item.row,8).setValue(new Date());
  logAction_(session,'DESACTIVAR_CONTENIDO_PUBLICO',item.id);
  return {ok:true};
}

function adminSaveFaq_(data) {
  const session = requireSession_(data.token, 'PUBLISH');
  const input = parseJson_(data.item);
  if (!normalize_(input.raffleId) || !normalize_(input.question) || !normalize_(input.answer)) throw new Error('Completa la pregunta y la respuesta.');
  const sheet = requiredSheet_(db_(), APP.SHEETS.FAQ);
  const id = normalize_(input.id) || ('FAQ-' + Utilities.getUuid().slice(0,8).toUpperCase());
  const existing = faqRows_().find(function(item){return item.id===id;});
  const row = [id,normalize_(input.raffleId),Number(input.order||1),normalize_(input.question),normalize_(input.answer),input.active===false?'NO':'SI',new Date()];
  if (existing) sheet.getRange(existing.row,1,1,row.length).setValues([row]); else sheet.appendRow(row);
  logAction_(session,'GUARDAR_PREGUNTA_FRECUENTE',id);
  return {ok:true,id:id};
}

function adminDeleteFaq_(data) {
  const session = requireSession_(data.token, 'PUBLISH');
  const item = faqRows_().find(function(row){return row.id===normalize_(data.id);});
  if (!item) throw new Error('Pregunta no encontrada.');
  requiredSheet_(db_(),APP.SHEETS.FAQ).getRange(item.row,6).setValue('NO');
  requiredSheet_(db_(),APP.SHEETS.FAQ).getRange(item.row,7).setValue(new Date());
  logAction_(session,'DESACTIVAR_PREGUNTA_FRECUENTE',item.id);
  return {ok:true};
}

function adminUploadImage_(data) {
  const session = requireSession_(data.token, 'DASHBOARD');
  const allowed = ['image/jpeg','image/png','image/webp'];
  const mime = normalize_(data.fileMime).toLowerCase();
  if (allowed.indexOf(mime)<0) throw new Error('La imagen debe ser JPG, PNG o WEBP.');
  const bytes = Utilities.base64Decode(String(data.fileBase64||'').replace(/^data:[^,]+,/,''));
  if (!bytes.length || bytes.length>8*1024*1024) throw new Error('La imagen es inválida o supera 8 MB.');
  const folder = publicImageFolder_();
  const filename = Utilities.formatDate(new Date(),APP.TZ,'yyyyMMdd-HHmmss')+'-'+normalize_(data.fileName||'imagen').replace(/[^a-zA-Z0-9._-]/g,'_');
  const file = folder.createFile(Utilities.newBlob(bytes,mime,filename));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(error) {}
  const url = 'https://drive.google.com/thumbnail?id='+file.getId()+'&sz=w2000';
  logAction_(session,'SUBIR_IMAGEN',filename);
  return {ok:true,url:url,driveUrl:file.getUrl()};
}

function adminCashPayment_(data) {
  const session = requireSession_(data.token, 'PAYMENTS');
  const input = parseJson_(data.participant);
  const raffle = raffleById_(data.raffleId);
  if (!raffle) throw new Error('Sorteo no encontrado.');
  if (!normalize_(input.fullName) || !normalizePhone_(input.phone)) throw new Error('Nombre y WhatsApp son obligatorios.');
  const tickets = normalizeTickets_(input.tickets, raffle.totalTickets);
  const map = numberRowMap_(raffle.id);
  const unavailable = tickets.filter(function(ticket){return !map[ticket] || map[ticket].status!==NUMBER_STATUS.AVAILABLE;});
  if (unavailable.length) throw new Error('No están disponibles: '+unavailable.join(', '));
  const now = new Date();
  const code = 'EFE-'+Utilities.formatDate(now,APP.TZ,'yyyyMMdd-HHmmss');
  const rows = tickets.map(function(ticket){return [now,raffle.id,ticket,normalize_(input.fullName),normalizePhoneDisplay_(input.phone),normalize_(input.email),normalize_(input.city),normalize_(input.identityNumber),'EFECTIVO',PAYMENT_STATUS.APPROVED,code,'',normalize_(input.notes),'',session.username,now];});
  const ps = requiredSheet_(db_(),APP.SHEETS.PARTICIPANTS);
  ps.getRange(ps.getLastRow()+1,1,rows.length,HEADERS.PARTICIPANTS.length).setValues(rows);
  const ns = requiredSheet_(db_(),APP.SHEETS.NUMBERS);
  tickets.forEach(function(ticket){const item=map[ticket];ns.getRange(item.row,3,1,6).setValues([[NUMBER_STATUS.SOLD,code,'','Pago en efectivo',session.username,now]]);});
  logAction_(session,'REGISTRAR_PAGO_EFECTIVO',code+' | '+tickets.join(', '));
  return {ok:true,code:code,tickets:tickets,totalAmount:tickets.length*raffle.ticketPrice,currency:raffle.currency};
}

function adminToggleUser_(data) {
  const session = requireSession_(data.token, '*');
  const user = findUser_(data.username);
  if (!user) throw new Error('Usuario no encontrado.');
  if (user.username===session.username) throw new Error('No puedes desactivar tu propia cuenta.');
  const next = user.status==='ACTIVO'?'INACTIVO':'ACTIVO';
  requiredSheet_(db_(),APP.SHEETS.USERS).getRange(user.row,7).setValue(next);
  logAction_(session,'CAMBIAR_ESTADO_USUARIO',user.username+' | '+next);
  return {ok:true,status:next};
}


function adminSystemConfig_(data) {
  requireSession_(data.token,'DASHBOARD');
  return {ok:true,config:raffleConfigMap_(data.raffleId || APP.DEFAULT_RAFFLE_ID)};
}

function adminSaveSystemConfig_(data) {
  const session=requireSession_(data.token,'*');
  const input=parseJson_(data.config);
  const raffleId=normalize_(data.raffleId || APP.DEFAULT_RAFFLE_ID);
  if(!raffleById_(raffleId)) throw new Error('Sorteo no encontrado.');
  saveRaffleConfig_(raffleId,input);
  logAction_(session,'GUARDAR_CONFIGURACION_SORTEO',raffleId);
  return {ok:true,config:raffleConfigMap_(raffleId)};
}

function adminTechnicalStatus_(data) {
  requireSession_(data.token,'DASHBOARD');const ss=db_();const c=configMap_();const active=normalize_(c.SORTEO_ACTIVO||APP.DEFAULT_RAFFLE_ID);
  return {ok:true,status:{app:'Sorteos Utopía',version:APP.VERSION,timezone:APP.TZ,spreadsheetName:ss.getName(),spreadsheetId:ss.getId(),spreadsheetUrl:ss.getUrl(),activeRaffleId:active,activeRaffleExists:Boolean(raffleById_(active)),raffles:raffleRows_().length,participants:participantRows_().length,numbers:numberRows_().length,users:userRows_().length,results:resultRows_().length}};
}

function adminBackup_(data) {
  const session = requireSession_(data.token, '*');
  const source = db_();
  const name = 'RESPALDO SORTEOS UTOPÍA '+Utilities.formatDate(new Date(),APP.TZ,'yyyy-MM-dd_HH-mm');
  const copy = DriveApp.getFileById(source.getId()).makeCopy(name);
  logAction_(session,'CREAR_COPIA_SEGURIDAD',name);
  return {ok:true,url:copy.getUrl(),name:name};
}

function impactRows_(raffleId, activeOnly) {
  const sheet = requiredSheet_(db_(),APP.SHEETS.CONTENT);
  if (sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS.CONTENT.length).getValues().map(function(row,index){return {row:index+2,id:normalize_(row[0]),raffleId:normalize_(row[1]),order:Number(row[2]||0),title:normalize_(row[3]),text:normalize_(row[4]),imageUrl:normalize_(row[5]),active:normalize_(row[6])==='SI',updatedAt:asDate_(row[7])};}).filter(function(item){return (!raffleId||item.raffleId===raffleId) && (!activeOnly||item.active);}).sort(sortByOrder_);
}

function faqRows_(raffleId, activeOnly) {
  const sheet = requiredSheet_(db_(),APP.SHEETS.FAQ);
  if (sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS.FAQ.length).getValues().map(function(row,index){return {row:index+2,id:normalize_(row[0]),raffleId:normalize_(row[1]),order:Number(row[2]||0),question:normalize_(row[3]),answer:normalize_(row[4]),active:normalize_(row[5])==='SI',updatedAt:asDate_(row[6])};}).filter(function(item){return (!raffleId||item.raffleId===raffleId) && (!activeOnly||item.active);}).sort(sortByOrder_);
}

function publicImageFolder_() {
  const props=PropertiesService.getScriptProperties();
  const existing=props.getProperty('PUBLIC_IMAGE_FOLDER_ID');
  if(existing){try{return DriveApp.getFolderById(existing);}catch(error){}}
  const folder=DriveApp.createFolder('Sorteos Utopía - Imágenes públicas');
  props.setProperty('PUBLIC_IMAGE_FOLDER_ID',folder.getId());
  return folder;
}

function setConfigValue_(key,value,description) {
  const sheet=requiredSheet_(db_(),APP.SHEETS.CONFIG);
  const row=findRowByValue_(sheet,1,key);
  const values=[key,value,description||''];
  if(row>1) sheet.getRange(row,1,1,3).setValues([values]); else sheet.appendRow(values);
}

/* ======================== DATOS Y CÁLCULOS ======================== */

function eligibleTickets_(raffleId, prizeId) {
  const approved = participantRows_(raffleId).filter(function(item){return item.paymentStatus===PAYMENT_STATUS.APPROVED;});
  const previous = new Set(resultRows_(raffleId).map(function(item){return item.ticket;}));
  const allowRepeat = raffleConfigMap_(raffleId).allowRepeatedWinner === 'SI';
  return approved.filter(function(item){return allowRepeat || !previous.has(item.ticket);});
}

function winnerCopies_(prize, winner) {
  const base = '🏆 ¡TENEMOS GANADOR!\n\nEl número ganador del Sorteo Utopía fue el '+winner.ticket+'.\n\nFelicitamos a '+winner.fullName+', ganador de '+prize.name+'.\n\nGracias a todas las personas que participaron y apoyaron los proyectos de Fundación Utopía.';
  return {facebook:base,instagram:base,whatsapp:base};
}

function groupParticipants_(raffleId, search, status) {
  const raffle = raffleById_(raffleId);
  const groups = {};
  participantRows_(raffleId).forEach(function(item) {
    if (!groups[item.code]) {
      groups[item.code] = {
        code:item.code,fullName:item.fullName,phone:item.phone,email:item.email,
        city:item.city,identityNumber:item.identityNumber,paymentMethod:item.paymentMethod,
        status:item.paymentStatus,proofUrl:item.proofUrl,notes:item.notes,
        createdAt:displayDate_(item.createdAt),createdAtMs:item.createdAt ? item.createdAt.getTime() : 0,tickets:[],totalAmount:0,currency:raffle.currency
      };
    }
    groups[item.code].tickets.push(item.ticket);
    groups[item.code].totalAmount += raffle.ticketPrice;
    groups[item.code].status = strongestPaymentStatus_(groups[item.code].status,item.paymentStatus);
    if (item.proofUrl) groups[item.code].proofUrl=item.proofUrl;
    if (item.notes) groups[item.code].notes=item.notes;
  });
  let items = Object.keys(groups).map(function(key){return groups[key];});
  const query = normalize_(search).toLowerCase();
  if (query) {
    items = items.filter(function(item) {
      return [item.code,item.fullName,item.phone,item.email,item.city,item.identityNumber,item.tickets.join(' ')]
        .join(' ').toLowerCase().indexOf(query)>=0;
    });
  }
  if (status) items=items.filter(function(item){return item.status===status;});
  items.sort(function(a,b){return Number(b.createdAtMs||0)-Number(a.createdAtMs||0);});
  return items;
}

function strongestPaymentStatus_(a,b) {
  const order = [PAYMENT_STATUS.EXPIRED,PAYMENT_STATUS.REJECTED,PAYMENT_STATUS.PENDING,PAYMENT_STATUS.RECEIVED,PAYMENT_STATUS.REVIEW,PAYMENT_STATUS.APPROVED];
  return order.indexOf(b)>order.indexOf(a)?b:a;
}

function numberStats_(rows) {
  const stats = {total:0,available:0,reserved:0,review:0,sold:0,blocked:0};
  rows.forEach(function(item){
    stats.total++;
    if (item.status===NUMBER_STATUS.AVAILABLE) stats.available++;
    if (item.status===NUMBER_STATUS.RESERVED) stats.reserved++;
    if (item.status===NUMBER_STATUS.REVIEW) stats.review++;
    if (item.status===NUMBER_STATUS.SOLD) stats.sold++;
    if (item.status===NUMBER_STATUS.BLOCKED) stats.blocked++;
  });
  return stats;
}

function releaseExpiredReservations_(raffleId) {
  const now = new Date();
  const participantSheet = requiredSheet_(db_(),APP.SHEETS.PARTICIPANTS);
  const numberSheet = requiredSheet_(db_(),APP.SHEETS.NUMBERS);
  const participantRows = participantRows_(raffleId).filter(function(item){
    return item.paymentStatus===PAYMENT_STATUS.PENDING && item.reservedUntil && item.reservedUntil.getTime()<=now.getTime();
  });
  if (!participantRows.length) return 0;
  const numberMaps = {};
  participantRows.forEach(function(item){
    participantSheet.getRange(item.row,10).setValue(PAYMENT_STATUS.EXPIRED);
    participantSheet.getRange(item.row,16).setValue(now);
    if (!numberMaps[item.raffleId]) numberMaps[item.raffleId]=numberRowMap_(item.raffleId);
    const numberItem=numberMaps[item.raffleId][item.ticket];
    if (numberItem && numberItem.status===NUMBER_STATUS.RESERVED) {
      numberSheet.getRange(numberItem.row,3,1,6).setValues([[NUMBER_STATUS.AVAILABLE,'','','Reserva vencida','SISTEMA',now]]);
    }
  });
  return participantRows.length;
}

function releaseParticipation_(code, status, notes, user) {
  const rows=participantRows_().filter(function(item){return item.code===code && item.paymentStatus===PAYMENT_STATUS.PENDING;});
  if (!rows.length) return 0;
  const participantSheet=requiredSheet_(db_(),APP.SHEETS.PARTICIPANTS);
  const numberSheet=requiredSheet_(db_(),APP.SHEETS.NUMBERS);
  const maps={}; const now=new Date();
  rows.forEach(function(item){
    participantSheet.getRange(item.row,10).setValue(status);
    participantSheet.getRange(item.row,13).setValue(notes);
    participantSheet.getRange(item.row,16).setValue(now);
    if (!maps[item.raffleId]) maps[item.raffleId]=numberRowMap_(item.raffleId);
    const numberItem=maps[item.raffleId][item.ticket];
    if (numberItem && numberItem.status===NUMBER_STATUS.RESERVED) {
      numberSheet.getRange(numberItem.row,3,1,6).setValues([[NUMBER_STATUS.AVAILABLE,'','','',user,now]]);
    }
  });
  return rows.length;
}

function syncNumbersForRaffle_(raffleId,total,user) {
  const sheet=requiredSheet_(db_(),APP.SHEETS.NUMBERS);
  const digits=Math.max(3,String(Math.max(1,total)).length);
  const existingRows=numberRows_(raffleId);
  const seen={};
  const duplicateRows=[];

  existingRows.forEach(function(item){
    const numeric=Number(String(item.number).replace(/\D/g,''));
    if(!Number.isInteger(numeric)||numeric<0||numeric>=total)return;
    const normalized=String(numeric).padStart(digits,'0');
    if(seen[numeric]){
      duplicateRows.push(item.row);
      return;
    }
    seen[numeric]=item;
    if(item.number!==normalized)sheet.getRange(item.row,2).setValue(normalized);
  });

  duplicateRows.sort(function(a,b){return b-a;}).forEach(function(row){sheet.deleteRow(row);});

  const rows=[];
  for (let index=0;index<total;index++) {
    if (!seen[index]) rows.push([raffleId,String(index).padStart(digits,'0'),NUMBER_STATUS.AVAILABLE,'','','',user,new Date()]);
  }
  if (rows.length) sheet.getRange(sheet.getLastRow()+1,1,rows.length,HEADERS.NUMBERS.length).setValues(rows);
  normalizeRelatedTicketDigits_(raffleId,total);
}

function normalizeRelatedTicketDigits_(raffleId,total) {
  const digits=Math.max(3,String(Math.max(1,total)).length);
  const participantSheet=requiredSheet_(db_(),APP.SHEETS.PARTICIPANTS);
  participantRows_(raffleId).forEach(function(item){
    const numeric=Number(String(item.ticket).replace(/\D/g,''));
    if(Number.isInteger(numeric)&&numeric>=0&&numeric<total){
      const normalized=String(numeric).padStart(digits,'0');
      if(item.ticket!==normalized)participantSheet.getRange(item.row,3).setValue(normalized);
    }
  });
  const resultSheet=requiredSheet_(db_(),APP.SHEETS.RESULTS);
  resultRows_(raffleId).forEach(function(item){
    const numeric=Number(String(item.ticket).replace(/\D/g,''));
    if(Number.isInteger(numeric)&&numeric>=0&&numeric<total){
      const normalized=String(numeric).padStart(digits,'0');
      if(item.ticket!==normalized)resultSheet.getRange(item.row,6).setValue(normalized);
    }
  });
  const prizeSheet=requiredSheet_(db_(),APP.SHEETS.PRIZES);
  prizesByRaffle_(raffleId).forEach(function(item){
    if(!item.winnerTicket)return;
    const numeric=Number(String(item.winnerTicket).replace(/\D/g,''));
    if(Number.isInteger(numeric)&&numeric>=0&&numeric<total){
      const normalized=String(numeric).padStart(digits,'0');
      if(item.winnerTicket!==normalized)prizeSheet.getRange(item.row,8).setValue(normalized);
    }
  });
}

function validatePublicParticipant_(data) {
  if (!normalize_(data.fullName)) throw new Error('Nombre completo obligatorio.');
  if (!normalizePhone_(data.phone)) throw new Error('WhatsApp obligatorio.');
  if (!normalize_(data.email)) throw new Error('Correo obligatorio.');
  if (!normalize_(data.city)) throw new Error('Ciudad obligatoria.');
  if (!normalize_(data.identityNumber)) throw new Error('Documento de identidad obligatorio.');
  if (!data.tickets) throw new Error('Selecciona al menos un número.');
}

function saveProof_(data, code) {
  const allowed=['image/jpeg','image/png','image/webp','application/pdf'];
  const mime=normalize_(data.proofMime).toLowerCase();
  if (allowed.indexOf(mime)<0) throw new Error('Formato de comprobante no permitido.');
  const bytes=Utilities.base64Decode(String(data.proofBase64).replace(/^data:[^,]+,/,''));
  if (bytes.length>5*1024*1024) throw new Error('El comprobante supera 5 MB.');
  const folder=proofFolder_();
  const filename=code+'-'+normalize_(data.proofName).replace(/[^a-zA-Z0-9._-]/g,'_');
  const file=folder.createFile(Utilities.newBlob(bytes,mime,filename));
  return file.getUrl();
}

function proofFolder_() {
  const props=PropertiesService.getScriptProperties();
  const existing=props.getProperty('PROOF_FOLDER_ID');
  if (existing) {
    try { return DriveApp.getFolderById(existing); } catch(error) {}
  }
  const folder=DriveApp.createFolder('Comprobantes Sorteos Utopía');
  props.setProperty('PROOF_FOLDER_ID',folder.getId());
  return folder;
}

/* ======================== LECTURA DE HOJAS ======================== */

function raffleRows_() {
  const sheet=requiredSheet_(db_(),APP.SHEETS.RAFFLES);
  if (sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS.RAFFLES.length).getValues().map(function(row,index){
    return {
      row:index+2,id:normalize_(row[0]),name:normalize_(row[1]),description:normalize_(row[2]),
      drawDate:asDate_(row[3]),ticketPrice:Number(row[4]||0),currency:normalize_(row[5]),
      totalTickets:Number(row[6]||0),status:normalize_(row[7]),imageUrl:normalize_(row[8]),
      projectTitle:normalize_(row[9]),projectDescription:normalize_(row[10]),
      goalAmount:Number(row[11]||0),published:normalize_(row[12]),updatedAt:asDate_(row[13])
    };
  });
}
function raffleById_(id){return raffleRows_().find(function(item){return item.id===normalize_(id);})||null;}

function prizesByRaffle_(raffleId){return prizeRows_().filter(function(item){return item.raffleId===raffleId;});}
function prizeRows_(){
  const sheet=requiredSheet_(db_(),APP.SHEETS.PRIZES);
  if (sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS.PRIZES.length).getValues().map(function(row,index){
    return {row:index+2,id:normalize_(row[0]),raffleId:normalize_(row[1]),order:Number(row[2]||0),name:normalize_(row[3]),description:normalize_(row[4]),imageUrl:normalize_(row[5]),status:normalize_(row[6]),winnerTicket:normalizeTicketText_(row[7]),published:normalize_(row[8]),updatedAt:asDate_(row[9])};
  });
}
function prizeById_(id){return prizeRows_().find(function(item){return item.id===normalize_(id);})||null;}

function participantRows_(raffleId){
  const sheet=requiredSheet_(db_(),APP.SHEETS.PARTICIPANTS);
  if (sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS.PARTICIPANTS.length).getValues().map(function(row,index){
    return {
      row:index+2,createdAt:asDate_(row[0]),raffleId:normalize_(row[1]),ticket:normalizeTicketText_(row[2]),
      fullName:normalize_(row[3]),phone:normalize_(row[4]),email:normalize_(row[5]),city:normalize_(row[6]),
      identityNumber:normalize_(row[7]),paymentMethod:normalize_(row[8]),paymentStatus:normalize_(row[9]),
      code:normalize_(row[10]),proofUrl:normalize_(row[11]),notes:normalize_(row[12]),
      reservedUntil:asDateOrNull_(row[13]),approvedBy:normalize_(row[14]),updatedAt:asDate_(row[15])
    };
  }).filter(function(item){return !raffleId || item.raffleId===raffleId;});
}

function numberRows_(raffleId){
  const sheet=requiredSheet_(db_(),APP.SHEETS.NUMBERS);
  if (sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS.NUMBERS.length).getValues().map(function(row,index){
    return {row:index+2,raffleId:normalize_(row[0]),number:normalizeTicketText_(row[1]),status:normalize_(row[2]),code:normalize_(row[3]),reservedUntil:asDateOrNull_(row[4]),notes:normalize_(row[5]),updatedBy:normalize_(row[6]),updatedAt:asDate_(row[7])};
  }).filter(function(item){return !raffleId || item.raffleId===raffleId;});
}
function numberRowMap_(raffleId){
  const map={}; numberRows_(raffleId).forEach(function(item){map[item.number]=item;}); return map;
}

function resultRows_(raffleId){
  const sheet=requiredSheet_(db_(),APP.SHEETS.RESULTS);
  if (sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS.RESULTS.length).getValues().map(function(row,index){
    return {row:index+2,id:normalize_(row[0]),raffleId:normalize_(row[1]),prizeId:normalize_(row[2]),order:Number(row[3]||0),prizeName:normalize_(row[4]),ticket:normalizeTicketText_(row[5]),fullName:normalize_(row[6]),city:normalize_(row[7]),participationCode:normalize_(row[8]),drawDate:asDate_(row[9]),responsible:normalize_(row[10]),published:normalize_(row[11]),blocked:normalize_(row[12]),facebookCopy:normalize_(row[13]),instagramCopy:normalize_(row[14]),whatsappCopy:normalize_(row[15])};
  }).filter(function(item){return !raffleId || item.raffleId===raffleId;});
}
function resultByPrize_(prizeId){const rows=resultRows_();for(let i=rows.length-1;i>=0;i--){if(rows[i].prizeId===normalize_(prizeId))return rows[i];}return null;}
function resultById_(id){return resultRows_().find(function(item){return item.id===normalize_(id);})||null;}

function userRows_(){
  const sheet=requiredSheet_(db_(),APP.SHEETS.USERS);
  if (sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS.USERS.length).getValues().map(function(row,index){
    return {row:index+2,username:normalizeUsername_(row[0]),name:normalize_(row[1]),email:normalize_(row[2]),role:normalize_(row[3]),salt:normalize_(row[4]),passwordHash:normalize_(row[5]),status:normalize_(row[6]),lastLogin:asDateOrNull_(row[7]),createdAt:asDate_(row[8])};
  });
}
function findUser_(username) {
  const normalized = normalizeUsername_(username);

  return userRows_().find(function(item) {
    return item.username === normalized;
  }) || null;
}

/**
 * Permite iniciar sesión usando:
 * - el USUARIO exacto;
 * - el CORREO;
 * - un usuario antiguo guardado sin el símbolo @.
 */
function findUserForLogin_(identifier) {
  const normalized = normalizeUsername_(
    identifier
  );

  const normalizedEmail = normalize_(
    identifier
  )
    .toLowerCase()
    .replace(/\s+/g, '');

  const legacyIdentifier = normalized
    .replace(/@/g, '');

  const users = userRows_();

  // 1. Coincidencia exacta con la columna USUARIO.
  const exactUsername = users.find(function(item) {
    return normalizeUsername_(
      item.username
    ) === normalized;
  });

  if (exactUsername) {
    return exactUsername;
  }

  // 2. Coincidencia exacta con la columna CORREO.
  const exactEmail = users.find(function(item) {
    return normalize_(
      item.email
    )
      .toLowerCase()
      .replace(/\s+/g, '') ===
      normalizedEmail;
  });

  if (exactEmail) {
    return exactEmail;
  }

  // 3. Compatibilidad con usuarios antiguos guardados sin @.
  return users.find(function(item) {
    return normalizeUsername_(
      item.username
    )
      .replace(/@/g, '') ===
      legacyIdentifier;
  }) || null;
}

function configMap_(){
  const sheet=requiredSheet_(db_(),APP.SHEETS.CONFIG);
  if(sheet.getLastRow()<2)return{};
  return sheet.getRange(2,1,sheet.getLastRow()-1,2).getValues().reduce(function(map,row){map[normalize_(row[0])]=row[1];return map;},{});
}

/* ======================== FORMATOS Y HELPERS ======================== */

function publicPrize_(prize){
  const result=resultByPrize_(prize.id);
  return {id:prize.id,order:prize.order,name:prize.name,description:prize.description,imageUrl:publicImageUrl_(prize.imageUrl,prizeImageFallback_(prize.order)),status:prize.status,winner:result&&result.published==='SI'?publicResult_(result):null};
}
function publicResult_(result){return {id:result.id,prizeId:result.prizeId,order:result.order,prizeName:result.prizeName,ticket:result.ticket,fullName:result.fullName,city:result.city,participationCode:result.participationCode,drawDate:iso_(result.drawDate)};}
function adminResult_(result){return {id:result.id,prizeId:result.prizeId,order:result.order,prizeName:result.prizeName,ticket:result.ticket,fullName:result.fullName,city:result.city,participationCode:result.participationCode,drawDate:displayDate_(result.drawDate),published:result.published==='SI',blocked:result.blocked==='SI',facebookCopy:result.facebookCopy,instagramCopy:result.instagramCopy,whatsappCopy:result.whatsappCopy};}
function sortByOrder_(a,b){return Number(a.order||0)-Number(b.order||0);}

function auditRows_(limit){
  const sheet=requiredSheet_(db_(),APP.SHEETS.LOG);
  if(sheet.getLastRow()<2)return[];
  const start=Math.max(2,sheet.getLastRow()-limit+1);
  return sheet.getRange(start,1,sheet.getLastRow()-start+1,HEADERS.LOG.length).getValues().reverse().map(function(row){
    return {date:displayDate_(row[0]),user:normalize_(row[1]),role:normalize_(row[2]),action:normalize_(row[3]),detail:normalize_(row[4])};
  });
}
function logAction_(session,action,detail){
  try{requiredSheet_(db_(),APP.SHEETS.LOG).appendRow([new Date(),session.username||'',session.role||'',action,detail]);}catch(error){console.log(error);}
}

function countBy_(items,key){
  const map={};items.forEach(function(item){const value=normalize_(item[key]||'Sin dato');map[value]=(map[value]||0)+1;});return map;
}
function mapToItems_(map){return Object.keys(map).map(function(key){return{label:key,count:map[key]};}).sort(function(a,b){return b.count-a.count;}).slice(0,10);}

function ensureSheet_(ss,name,headers){
  let sheet=ss.getSheetByName(name);if(!sheet)sheet=ss.insertSheet(name);
  if(sheet.getMaxColumns()<headers.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
  sheet.getRange(1,1,1,headers.length).setValues([headers]);return sheet;
}
function requiredSheet_(ss,name){const sheet=ss.getSheetByName(name);if(!sheet)throw new Error('No existe la hoja '+name+'. Ejecuta configurarSistema().');return sheet;}
function styleSheet_(sheet){const cols=sheet.getLastColumn();if(!cols)return;sheet.getRange(1,1,1,cols).setBackground('#0872b9').setFontColor('#fff').setFontWeight('bold').setHorizontalAlignment('center');sheet.setFrozenRows(1);sheet.autoResizeColumns(1,cols);}
function setValidations_(participants,numbers,raffles,prizes,users){
  participants.getRange('J2:J').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(PAYMENT_STATUS).map(function(k){return PAYMENT_STATUS[k];}),true).setAllowInvalid(false).build());
  numbers.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(NUMBER_STATUS).map(function(k){return NUMBER_STATUS[k];}),true).setAllowInvalid(false).build());
  raffles.getRange('H2:H').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['ACTIVO','PROGRAMADO','PAUSADO','FINALIZADO','CANCELADO'],true).setAllowInvalid(false).build());
  prizes.getRange('G2:G').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['PENDIENTE','SORTEADO','CANCELADO'],true).setAllowInvalid(false).build());
  users.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([ROLES.ADMIN,ROLES.OPERATOR,ROLES.FINANCE,ROLES.COMMS,ROLES.AUDITOR],true).setAllowInvalid(false).build());
}
function upsertConfig_(sheet,rows){rows.forEach(function(row){const found=findRowByValue_(sheet,1,row[0]);if(found>1)sheet.getRange(found,1,1,row.length).setValues([row]);else sheet.appendRow(row);});}
function findRowByValue_(sheet,column,value){if(sheet.getLastRow()<2)return-1;const values=sheet.getRange(2,column,sheet.getLastRow()-1,1).getValues();for(let i=0;i<values.length;i++){if(normalize_(values[i][0])===normalize_(value))return i+2;}return-1;}


function spreadsheetForSetup_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();

  if (active) {
    return active;
  }

  const id = PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID');

  if (id) {
    return SpreadsheetApp.openById(id);
  }

  throw new Error(
    'No se encontró el Google Sheet. Abre Apps Script desde Extensiones del archivo o configura SPREADSHEET_ID.'
  );
}

function notify_(title, message) {
  console.log(title + ': ' + message);

  try {
    spreadsheetForSetup_().toast(
      String(message),
      String(title),
      8
    );
  } catch (error) {
    console.log('No se pudo mostrar la notificación: ' + error.message);
  }
}

function clearConfigValue_(key) {
  const sheet = requiredSheet_(db_(), APP.SHEETS.CONFIG);
  const row = findRowByValue_(sheet, 1, key);

  if (row > 1) {
    sheet.getRange(row, 2).clearContent();
  }
}

function db_(){
  const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if(id)return SpreadsheetApp.openById(id);
  const active=SpreadsheetApp.getActiveSpreadsheet();
  if(active)return active;
  throw new Error('Ejecuta configurarSistema desde el Google Sheet.');
}
function parseBody_(e){
  const text=e&&e.postData&&e.postData.contents?e.postData.contents:'';
  if(text&&text.trim().charAt(0)==='{')return JSON.parse(text);
  const params=Object.assign({},(e&&e.parameter)||{});
  ['tickets','raffle','prize','participant','user'].forEach(function(key){if(typeof params[key]==='string'&&(params[key].trim().charAt(0)==='{'||params[key].trim().charAt(0)==='[')){try{params[key]=JSON.parse(params[key]);}catch(error){}}});
  return params;
}
function parseJson_(value){if(value&&typeof value==='object')return value;try{return JSON.parse(String(value||'{}'));}catch(error){return{};}}
function json_(payload){return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);}

function normalize_(value){return String(value===null||value===undefined?'':value).trim();}
function normalizeUsername_(value) {
  return normalize_(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9@._+-]/g, '');
}
function normalizePhone_(value){return String(value||'').replace(/\D/g,'');}
function normalizePhoneDisplay_(value){return normalize_(value);}
function phonesMatch_(a,b){const first=normalizePhone_(a),second=normalizePhone_(b);return first&&second&&(first===second||first.slice(-8)===second.slice(-8));}
function normalizeTicketText_(value){const text=normalize_(value);return /^\d+$/.test(text)?text.padStart(Math.max(3,text.length),'0'):text;}
function normalizeTickets_(input,total){
  let values=input;if(typeof values==='string'){try{values=JSON.parse(values);}catch(error){values=values.split(',');}}
  if(!Array.isArray(values))values=[values];
  const digits=Math.max(3,String(Math.max(1,total)).length);const set=new Set();
  values.forEach(function(value){const clean=String(value).replace(/\D/g,'');const number=Number(clean);if(clean===''||!Number.isInteger(number)||number<0||number>=total)throw new Error('Número fuera de rango: '+value);set.add(String(number).padStart(digits,'0'));});
  return Array.from(set);
}
function participationCode_(){return 'UTP-'+Utilities.formatDate(new Date(),APP.TZ,'yyyyMMdd')+'-'+Utilities.getUuid().replace(/-/g,'').slice(0,6).toUpperCase();}
function hashPassword_(password,salt){const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+String(password),Utilities.Charset.UTF_8);return bytes.map(function(byte){const value=byte<0?byte+256:byte;return ('0'+value.toString(16)).slice(-2);}).join('');}
function asDate_(value){if(value instanceof Date)return value;const date=new Date(value);return isNaN(date.getTime())?new Date(0):date;}
function asDateOrNull_(value){if(!value)return null;const date=value instanceof Date?value:new Date(value);return isNaN(date.getTime())?null:date;}
function iso_(value){return value?asDate_(value).toISOString():null;}
function localDateTime_(value){return Utilities.formatDate(asDate_(value),APP.TZ,"yyyy-MM-dd'T'HH:mm");}
function displayDate_(value){return value?Utilities.formatDate(asDate_(value),APP.TZ,'dd/MM/yyyy HH:mm:ss'):'';}
function formatMoneyText_(value,currency){return Number(value||0).toFixed(2)+' '+currency;}
