# sistema_inventario_LWI

Modo oscuro: usa el botón de luna/sol del encabezado o de la pantalla de acceso. También puedes elegir Claro u Oscuro en **Configuración → Apariencia**. La preferencia se conserva en este navegador y se sincroniza entre pestañas, con textos en español, inglés y francés. No requiere cambios de base de datos.

Prueba del tema sin base de datos: desde `frontend`, ejecuta `node --test theme.test.mjs`. Para verificar los tamaños en el tema oscuro, configura `LWI_RESPONSIVE_THEME=dark` antes de ejecutar `npm run test:responsive` (requiere Playwright y Edge, como la prueba responsiva existente).

Sprint 6: [diagnóstico, modelos y migración propuesta de Entradas/Salidas](backend/prisma/proposals/sprint6/README.md). Preparación sin migraciones aplicadas; guardar y confirmar movimientos requieren autorización e integración posterior.
