-- Esquema de referencia usado por este backend.
-- Si ya creaste las tablas en DBeaver, NO necesitas ejecutar este archivo nuevamente.

CREATE TABLE rol (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(150),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuarios (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    correo VARCHAR(180) NOT NULL UNIQUE,
    contraseña VARCHAR(255) NOT NULL,
    rol_id BIGINT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_acceso TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_usuario_rol
        FOREIGN KEY (rol_id)
        REFERENCES rol(id)
        ON DELETE RESTRICT
);

INSERT INTO rol (nombre, descripcion)
VALUES
('Administrador', 'Administrador general del sistema'),
('Solicitante', 'Usuario que realiza solicitudes de inventario'),
('Compras', 'Usuario encargado de procesos de compras'),
('Finanzas', 'Usuario del área financiera');
