# NEXORA · Laboratorio 07 · Balanceo de carga

Aplicación web de **login + CRUD de tareas** que corre detrás de un balanceador de carga.
Se implementó en dos partes: balanceo **local con Nginx** y balanceo **en la nube con AWS**.

**Curso:** Desarrollo de Soluciones en la Nube
**Laboratorio:** GLAB-S07 · Diseñar un entorno
**Autora:** Sarai Soto

---

## Qué hace

- Registro e inicio de sesión de usuarios con **JWT** (sin estado en el servidor).
- CRUD de tareas por usuario: crear, listar, editar, completar y eliminar.
- Cada respuesta incluye el encabezado `X-Served-By`, y la interfaz muestra **qué backend atendió** cada petición. Así se ve el balanceo en acción.

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express |
| Base de datos | MySQL (`lab07`, tablas `users` y `tasks`) |
| Seguridad | bcryptjs (hash de contraseñas) + JSON Web Tokens |
| Balanceo local | Nginx (Round Robin) |
| Balanceo en la nube | AWS: VPC, EC2, Target Group y Application Load Balancer |

---

## Arquitectura

### Parte A · Local con Nginx

```
Cliente ──► Nginx :8080 (Round Robin) ──┬──► backend-1  127.0.0.1:8081
                                        ├──► backend-2  127.0.0.1:8082
                                        └──► backend-3  127.0.0.1:8083
                                                  │
                                              MySQL (lab07)
```

Los tres backends son el mismo programa (`server.js`) en puertos distintos y **comparten la misma base de datos**.
Como el login usa JWT sin estado, cualquier backend puede atender a cualquier usuario.

> Se usó el puerto 8080 en lugar del 80 porque Windows tenía el 80 restringido.

### Parte B · AWS

```
Internet ──► Application Load Balancer (HTTP:80 + health checks)
                 ├──► web-server-1  EC2 · us-east-1a
                 └──► web-server-2  EC2 · us-east-1b
                      (VPC 10.0.0.0/16 · 2 subredes públicas)
```

- **VPC** `10.0.0.0/16` con 2 subredes públicas en `us-east-1a` y `us-east-1b`, Internet Gateway y tabla de rutas.
- **2 instancias EC2** con Apache, cada una muestra su Instance ID y su zona.
- **Target Group** `tg-lab-web` con health check en la ruta `/`.
- **Application Load Balancer** `alb-lab-web` con listener HTTP:80.
- **Security Group** con HTTP (80) abierto a `0.0.0.0/0`.

**Prueba de tolerancia a fallos:** se detuvo `web-server-1`, el Target Group la marcó `Unhealthy`
y todo el tráfico fue a `web-server-2`. Al reiniciarla volvió a `Healthy`.

Al finalizar se eliminaron todos los recursos de AWS para evitar costos.

---

## Estructura del proyecto

```
lab07-balanceo/
├── server.js          # API Express (auth, CRUD, health check)
├── package.json
├── public/
│   └── index.html     # Interfaz web
├── nginx/
│   └── nginx.conf     # Configuración del balanceador local
└── README.md
```

## Requisitos

- Node.js 18 o superior
- MySQL o MariaDB en ejecución
- Nginx (para el balanceo local)

## Cómo ejecutarlo

### 1. Instalar dependencias

```bash
npm install
```

### 2. Encender MySQL

El backend crea la base `lab07` y las tablas `users` y `tasks` automáticamente al iniciar.

### 3. Levantar los 3 backends (una terminal por cada uno)

**PowerShell**

```powershell
$env:PORT="8081"; $env:SERVER_NAME="backend-1"; node server.js
$env:PORT="8082"; $env:SERVER_NAME="backend-2"; node server.js
$env:PORT="8083"; $env:SERVER_NAME="backend-3"; node server.js
```

### 4. Iniciar Nginx

Usa el archivo `nginx/nginx.conf` de este repositorio como configuración de Nginx y arráncalo:

```powershell
start nginx
```

### 5. Probar

Abre `http://localhost:8080`, regístrate, inicia sesión y crea tareas.
Para ver el Round Robin desde la terminal:

```powershell
1..9 | ForEach-Object { curl.exe -si http://localhost:8080/api/info | findstr /i "x-served-by" }
```

## Variables de entorno

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `PORT` | `8081` | Puerto del backend |
| `SERVER_NAME` | `backend-<PORT>` | Nombre que se muestra en `X-Served-By` |
| `JWT_SECRET` | valor de laboratorio | Clave para firmar los tokens |
| `DB_HOST` | `127.0.0.1` | Host de MySQL |
| `DB_PORT` | `3306` | Puerto de MySQL |
| `DB_USER` | `root` | Usuario de MySQL |
| `DB_PASSWORD` | vacío | Contraseña de MySQL |
| `DB_NAME` | `lab07` | Nombre de la base de datos |

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | No | Estado del servidor (health check) |
| GET | `/api/info` | No | Nombre del backend y hora |
| POST | `/api/register` | No | Registrar usuario |
| POST | `/api/login` | No | Iniciar sesión, devuelve un JWT |
| GET | `/api/tasks` | Sí | Listar tareas del usuario |
| POST | `/api/tasks` | Sí | Crear tarea |
| PUT | `/api/tasks/:id` | Sí | Editar tarea |
| DELETE | `/api/tasks/:id` | Sí | Eliminar tarea |

Las rutas protegidas requieren el encabezado `Authorization: Bearer <token>`.

## Conclusiones

1. Nginx con Round Robin reparte las peticiones de forma cíclica entre los tres backends.
2. La app funciona detrás del balanceador porque el JWT no guarda estado y los backends comparten la base de datos.
3. El Application Load Balancer de AWS, con health checks, detecta servidores caídos y deja de enviarles tráfico, lo que da alta disponibilidad.
4. El Security Group debe permitir HTTP desde `0.0.0.0/0` para que el balanceador haga sus comprobaciones.
