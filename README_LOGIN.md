# Login y recuperación comparten AuthVisual.jsx con branding HTML y textos traducibles. El login utiliza frontend/src/assets/images/login-living-water.png y recuperación utiliza frontend/src/assets/images/Olvidastetucontraseña.png. Ambos archivos actuales son imágenes limpias, sin logo ni textos incrustados. Los fondos cubren el panel con background-size:cover; el logo y las frases son elementos independientes. Ya no falta la fotografía. Se conserva la distribución 42%/58%, formulario de hasta 500px e idioma persistente.

El backend solo expone POST /api/auth/login. Recuperación valida el correo y muestra que el servicio no está disponible; no envía correos ni muestra éxito ficticio. Home sigue siendo la pantalla protegida provisional existente, no el dashboard completo de la referencia.

## Archivos creados

- frontend/src/components/auth/AuthVisual.jsx
- frontend/src/components/auth/AuthLayout.jsx
- frontend/src/context/LanguageContext.jsx
- ENTREGA_LOGIN.md (contenido completo listo para copiar)
- README_LOGIN.md se actualizó.

## Archivos reemplazados

- frontend/src/pages/Login.jsx
- frontend/src/pages/ForgotPassword.jsx
- frontend/src/styles/global.css
- frontend/src/services/authService.js

main.jsx se actualizó para incluir LanguageProvider. AuthContext.jsx, ProtectedRoute.jsx, Home.jsx, App.jsx y package.json existentes se mantienen y se incluyen completos en ENTREGA_LOGIN.md.

## Arranque

En una terminal desde la raíz:
```powershell
cd backend
npm install
# Si falta .env, copia .env.example a .env y configura PostgreSQL y JWT_SECRET.
npm run prisma:generate
npm run dev
```

La base PostgreSQL debe estar creada y tener el esquema del backend. Sigue backend/README.md para su configuración. npm run seed crea el usuario inicial definido en backend/.env; úsalo únicamente si necesitas preparar datos de desarrollo.

En otra terminal desde la raíz:
```powershell
cd frontend
npm install
# Si falta .env, copia .env.example a .env.
npm run dev
```

frontend/.env debe contener:
```env
VITE_API_URL=http://localhost:3000/api
```
backend/.env: FRONTEND_URL=http://localhost:5173
Abre http://localhost:5173/login. Para compilar: npm run build dentro de frontend.

## Comprobar petición real

1. Abre DevTools > Network > Fetch/XHR.
2. Ingresa un correo válido y contraseña, pulsa Iniciar sesión.
3. Busca la petición POST a http://localhost:3000/api/auth/login.
4. En Payload verifica las claves correo y contrasena.
5. En Response verifica el estado y el mensaje. Un error se muestra debajo del botón y no redirige.
6. Con credenciales válidas, el backend debe responder data.token y data.usuario; el frontend redirige a /.

No compartas capturas que revelen contraseñas o tokens.

## Comprobar JWT y Recordarme

DevTools > Application > Storage:
- Activado: Local Storage > lwi_session.
- Desactivado: Session Storage > lwi_session.
El JSON contiene token, usuario y expiresIn. La otra ubicación se limpia al iniciar sesión.
Recarga y comprueba que la sesión se conserva. Cierra sesión para limpiar ambas ubicaciones.
Repite el inicio de sesión con Recordarme desactivado para comprobar sessionStorage.

## Verificación

npm run build pasó. El renderizado del panel compartido, el selector y el aviso de acceso se comprobó en español e inglés. No se verificó un inicio de sesión contra PostgreSQL ni la fidelidad visual en navegador. Revisa ambos formularios en 1920x1080, 1600x900, 1366x768, 768x1024 y 375x812. El layout evita alturas fijas y permite desplazamiento vertical en pantallas bajas.