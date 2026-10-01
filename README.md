# Lab 07 — Nexora | Login + CRUD con balanceo de carga

Aplicación de laboratorio con autenticación JWT, CRUD de tareas, MySQL y encabezado `X-Served-By` para identificar el backend que atendió cada solicitud.

## Requisitos
- Node.js 18 o superior
- MySQL o MariaDB en ejecución
- Base de datos accesible desde la máquina donde corre el backend

## Configuración
El backend crea la base `lab07` y las tablas `users` y `tasks` al iniciar, si no existen. Configura las variables de entorno antes de arrancar si tu MySQL usa credenciales diferentes:

**Git Bash**
```bash
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_USER=root
export DB_PASSWORD='TU_CLAVE_MYSQL'
export DB_NAME=lab07
export PORT=8081
export SERVER_NAME=backend-1
```

**PowerShell**
```powershell
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="3306"
$env:DB_USER="root"
$env:DB_PASSWORD="TU_CLAVE_MYSQL"
$env:DB_NAME="lab07"
$env:PORT="8081"
$env:SERVER_NAME="backend-1"
```

## Instalar y ejecutar
```bash
npm install
npm start
```
Abre `http://localhost:8081`. En el primer uso selecciona **Regístrate** para crear un usuario y después inicia sesión. No hay una contraseña de demostración predefinida.

## Ejecutar instancias para balanceo local
Abre tres terminales, configura un puerto y nombre distintos en cada una y ejecuta `npm start`:

| Instancia | PORT | SERVER_NAME |
|---|---:|---|
| Backend 1 | 8081 | backend-1 |
| Backend 2 | 8082 | backend-2 |
| Backend 3 | 8083 | backend-3 |

Las tres instancias deben compartir la misma base de datos y el mismo `JWT_SECRET`. Por ejemplo, define `JWT_SECRET` con el mismo valor en cada terminal. El balanceador Nginx puede dirigir el tráfico web hacia estos puertos.

## Rutas principales
- `POST /api/register` — registrar usuario
- `POST /api/login` — iniciar sesión y obtener JWT
- `GET /api/tasks` — listar tareas propias (Bearer token)
- `POST /api/tasks` — crear tarea (Bearer token)
- `PUT /api/tasks/:id` — actualizar tarea (Bearer token)
- `DELETE /api/tasks/:id` — eliminar tarea (Bearer token)
- `GET /health` — verificación de salud
- `GET /api/info` — información del backend

## Nota para la captura de SQLyog
Selecciona la base `lab07` y ejecuta `SHOW TABLES;`. Para mostrar las columnas, ejecuta `DESCRIBE users;` y `DESCRIBE tasks;`. Para mostrar registros de demostración, inicia sesión en la aplicación y crea algunas tareas; luego ejecuta `SELECT * FROM users;` y `SELECT * FROM tasks;` en SQLyog.
