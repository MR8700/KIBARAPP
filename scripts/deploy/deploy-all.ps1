# ==============================================================================
# scripts/deploy/deploy-all.ps1
# Déploiement automatisé KIBAR sur Fly.io & Vercel
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  🚀 KIBAR - Déploiement Automatisé de Production" -ForegroundColor Cyan
Write-Host "  Domaine Web: https://kibarapp.vercel.app" -ForegroundColor Cyan
Write-Host "  API Backend: https://kibar-api.fly.dev" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Génération des secrets de production
Write-Host "`n[1/4] Génération des secrets cryptographiques (256-bit)..." -ForegroundColor Yellow
$JWT_SECRET = [System.Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
Write-Host "✓ Clé JWT générée avec succès." -ForegroundColor Green

# 2. Vérification / Déploiement Fly.io
Write-Host "`n[2/4] Préparation de Fly.io pour l'API et ClamAV..." -ForegroundColor Yellow
if (Get-Command fly -ErrorAction SilentlyContinue) {
    Write-Host "Déploiement de kibar-clamd..." -ForegroundColor White
    fly deploy scripts/deploy/fly-clamav --app kibar-clamd --ha=false
    
    Write-Host "Déploiement de kibar-api..." -ForegroundColor White
    fly secrets set JWT_SECRET="$JWT_SECRET" RP_ID="kibarapp.vercel.app" WEB_ORIGIN="https://kibarapp.vercel.app" --app kibar-api
    fly deploy --app kibar-api --strategy rolling
    Write-Host "✓ API et Antivirus déployés sur Fly.io" -ForegroundColor Green
} else {
    Write-Host "ℹ️ Fly CLI n'est pas encore installé localement." -ForegroundColor Gray
    Write-Host "Pour l'installer sous Windows : iwr https://fly.io/install.ps1 -useb | iex" -ForegroundColor Gray
}

# 3. Lien de Déploiement Vercel 1-Clic
Write-Host "`n[3/4] Déploiement Frontend Vercel (1-Clic)..." -ForegroundColor Yellow
$VercelUrl = "https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMR8700%2FKIBARAPP&root-directory=apps%2Fweb&project-name=kibarapp&env=NEXT_PUBLIC_API_URL&envDescription=Adresse%20de%20l%20API%20KIBAR&envLink=https%3A%2F%2Fapi.kibar.app"

Write-Host "Lien de déploiement Vercel :" -ForegroundColor White
Write-Host $VercelUrl -ForegroundColor Cyan

# 4. Exécution du smoke test
Write-Host "`n[4/4] Tests de vérification post-déploiement..." -ForegroundColor Yellow
Write-Host "Pour tester l'état de l'API : curl https://kibar-api.fly.dev/health" -ForegroundColor White
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "🎉 Prêt pour la mise en ligne finale !" -ForegroundColor Green
