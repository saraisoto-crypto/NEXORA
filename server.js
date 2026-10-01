
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const os = require('os');

const app = express();

const PORT = Number(process.env.PORT || 8081);
const SERVER_NAME = process.env.SERVER_NAME || `backend-${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-lab07-cambiar';

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lab07'
};

let pool;

app.use(express.json());

// Identifica al backend que atendió la petición
app.use((req, res, next) => {
  res.setHeader('X-Served-By', SERVER_NAME);
  next();
});

// Interfaz web
app.use(express.static(path.join(__dirname, 'public')));

// Información del servidor y health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: SERVER_NAME, port: PORT });
});

app.get('/api/info', (req, res) => {
  res.json({
    server: SERVER_NAME,
    port: PORT,
    hostname: os.hostname(),
    time: new Date().toISOString()
  });
});

// Autenticación
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Token inválido o expirado'
    });
  }
}

// Registrar usuario
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      !username.trim() ||
      password.length < 4
    ) {
      return res.status(400).json({
        error: 'Ingresa un usuario y una contraseña de al menos 4 caracteres'
      });
    }

    const cleanUsername = username.trim();
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [cleanUsername, hash]
    );

    res.status(201).json({
      message: 'Usuario registrado correctamente'
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Este usuario ya existe'
      });
    }

    console.error('Error al registrar:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Iniciar sesión
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        error: 'Ingresa tu usuario y contraseña'
      });
    }

    const [rows] = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE username = ?',
      [username.trim()]
    );

    if (
      !rows.length ||
      !(await bcrypt.compare(password, rows[0].password_hash))
    ) {
      return res.status(401).json({
        error: 'Usuario o contraseña incorrectos'
      });
    }

    const user = rows[0];

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      token,
      username: user.username
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Listar tareas del usuario autenticado
app.get('/api/tasks', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, user_id, title, description, done, created_at
       FROM tasks
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC`,
      [req.user.id]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al listar tareas:', error);
    res.status(500).json({ error: 'No se pudieron cargar las tareas' });
  }
});

// Crear tarea
app.post('/api/tasks', auth, async (req, res) => {
  try {
    const { title, description = '' } = req.body || {};

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        error: 'El título de la tarea es obligatorio'
      });
    }

    if (title.trim().length > 120 || String(description).length > 500) {
      return res.status(400).json({
        error: 'El título o la descripción supera el límite permitido'
      });
    }

    const [result] = await pool.query(
      `INSERT INTO tasks (user_id, title, description, done)
       VALUES (?, ?, ?, 0)`,
      [req.user.id, title.trim(), String(description)]
    );

    res.status(201).json({
      id: result.insertId,
      title: title.trim(),
      description: String(description),
      done: 0
    });
  } catch (error) {
    console.error('Error al crear tarea:', error);
    res.status(500).json({ error: 'No se pudo crear la tarea' });
  }
});

// Editar tarea
app.put('/api/tasks/:id', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, done } = req.body || {};

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de tarea inválido' });
    }

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        error: 'El título de la tarea es obligatorio'
      });
    }

    if (title.trim().length > 120 || String(description ?? '').length > 500) {
      return res.status(400).json({
        error: 'El título o la descripción supera el límite permitido'
      });
    }

    // Verifica que la tarea pertenezca al usuario
    const [tasks] = await pool.query(
      'SELECT id, done FROM tasks WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (!tasks.length) {
      return res.status(404).json({
        error: 'No se encontró la tarea'
      });
    }

    // Si no se envía done, conserva su valor actual
    const newDone = done === undefined
      ? tasks[0].done
      : (done ? 1 : 0);

    await pool.query(
      `UPDATE tasks
       SET title = ?, description = ?, done = ?
       WHERE id = ? AND user_id = ?`,
      [
        title.trim(),
        String(description ?? ''),
        newDone,
        id,
        req.user.id
      ]
    );

    res.json({
      message: 'Tarea actualizada correctamente',
      id,
      title: title.trim(),
      description: String(description ?? ''),
      done: newDone
    });
  } catch (error) {
    console.error('Error al editar tarea:', error);
    res.status(500).json({ error: 'No se pudo actualizar la tarea' });
  }
});

// Eliminar tarea
app.delete('/api/tasks/:id', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de tarea inválido' });
    }

    const [result] = await pool.query(
      'DELETE FROM tasks WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        error: 'No se encontró la tarea'
      });
    }

    res.json({ message: 'Tarea eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar tarea:', error);
    res.status(500).json({ error: 'No se pudo eliminar la tarea' });
  }
});

// Crear base de datos y tablas
async function initDb() {
  const connection = await mysql.createConnection({
    host: DB.host,
    port: DB.port,
    user: DB.user,
    password: DB.password
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB.database}\``
  );

  await connection.end();

  pool = mysql.createPool({
    ...DB,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(120) NOT NULL,
      description VARCHAR(500) DEFAULT '',
      done TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);
}

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`${SERVER_NAME} escuchando en puerto ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo iniciar:', error.message);
    process.exit(1);
  });