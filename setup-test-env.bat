@echo off
echo ========================================
echo Setup do Ambiente de Teste Local
echo ========================================
echo.

echo 1. Iniciando Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

echo 2. Aguardando Docker iniciar...
timeout /t 15 /nobreak

echo 3. Iniciando container PostgreSQL...
docker-compose up -d postgres

echo 4. Aguardando PostgreSQL ficar pronto...
timeout /t 10 /nobreak

echo 5. Aplicando schema do Prisma...
npx prisma db push

echo 6. Populando dados iniciais (opcional)...
npx prisma db seed

echo.
echo ========================================
echo Ambiente de teste configurado!
echo ========================================
echo.
echo DATABASE_URL local configurada em .env.test
echo O script de teste agora usa este banco local
echo em vez do banco de producao.
echo.
pause
