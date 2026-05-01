# Autentifikace a JWT

## 1. Přehled

Autentifikace řeší ověření identity uživatele při přihlášení a vydání JWT tokenu pro následné autorizované požadavky. Backend používá:

- **BCrypt** pro ověření hesla (hash uložený v DB).
- **JWT (HS256)** pro bezstavové přihlašovací tokeny s platností 24 hodin.
- `UpdateLastSeen` pro sledování poslední aktivity uživatele.

Relevantní soubory:
- `Controllers/AuthController.cs`
- `Services/JwtService.cs`
- `Models/LoginModel.cs`

---

## 2. Login flow

**Endpoint:** `POST /api/auth/login`

1. Klient pošle `{ "username": "...", "password": "..." }`.
2. `_userService.GetByUserName(request.Username)` — hledá uživatele podle jména; vrátí `null` → `401 Unauthorized("Uživatel neexistuje")`.
3. Kontrola `user.PasswordHash` — pokud je prázdný nebo null → `401 Unauthorized("Účet má neplatné heslo.")`.
4. `BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash)` — porovná plain-text heslo s hashem; neshoda → `401 Unauthorized("Neplatné heslo")`; výjimka BCryptu → `500 ("Chyba ověření hesla")`.
5. `_jwtService.GenerateToken(user.Id, user.Username, user.Role, user.CharacterPath, user.IkarosSkin, user.AKJ)` — vygeneruje JWT token.
6. `_userService.UpdateLastSeen(user.Id)` — aktualizuje timestamp poslední aktivity.
7. Vrátí `200 OK` s tělem `{ token, themeSettings }`.

**Refresh endpoint:** `POST /api/auth/refresh/{id}`

1. Načte uživatele podle `id` (`_userService.Get(id)`); neexistuje → `401`.
2. Vygeneruje nový token stejným způsobem jako při loginu.
3. Zavolá `UpdateLastSeen`.
4. Vrátí `200 OK` s `{ token, themeSettings }`.

---

## 3. JWT token

### Claims

| Claim | Typ / registrovaný název | Hodnota |
|---|---|---|
| `sub` | `JwtRegisteredClaimNames.Sub` | `user.Id` (string) |
| `unique_name` | `JwtRegisteredClaimNames.UniqueName` | `user.Username` |
| `role` | `ClaimTypes.Role` | `user.Role.ToString()` (hodnota enumu `UserRole`) |
| `characterPath` | custom claim `"characterPath"` | `user.CharacterPath` nebo `""` pokud null |
| `ikarosSkin` | custom claim `"ikarosSkin"` | `user.IkarosSkin` nebo `"default"` pokud null |
| `akj` | custom claim `"akj"` | `user.AKJ.ToString()` (int, výchozí `0`) |

### Podpis a algoritmus

- Algoritmus: **HMAC-SHA256** (`SecurityAlgorithms.HmacSha256`)
- Klíč: `SymmetricSecurityKey` odvozený z UTF-8 bajtu `JwtSettings.Secret`

### Platnost

- Expirace: `DateTime.UtcNow.AddDays(1)` — pevně 24 hodin od vydání.
- Pole `JwtSettings.ExpiryMinutes` je v modelu definováno, ale **v `GenerateToken` se nepoužívá** — expiry je hardcoded na 1 den.

### Validační parametry (konfigurace při startu)

Nastavují se přes `JwtSettings` (viz sekce 5). Standardní validace ASP.NET Core JWT middlewaru kontroluje:
- `issuer` = `JwtSettings.Issuer`
- `audience` = `JwtSettings.Audience`
- podpis klíčem `JwtSettings.Secret`
- čas expirace

---

## 4. API endpointy

| Metoda | URL | Vstup | Výstup | Auth |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | `LoginModel` (JSON body): `username`, `password` | `{ token: string, themeSettings: object }` | Ne |
| `POST` | `/api/auth/refresh/{id}` | `id` (route param, string — userId) | `{ token: string, themeSettings: object }` | Ne (nekontroluje token, jen existenci uživatele) |

### LoginModel

```csharp
public class LoginModel
{
    [Required] public string Username { get; set; }
    [Required] public string Password { get; set; }
}
```

Obě pole jsou povinná (`[Required]`). Validace probíhá automaticky přes model binding.

---

## 5. Konfigurace — JwtSettings

Třída je definována v `Services/JwtService.cs` (nikoliv ve vlastním souboru `Models/JwtSettings.cs`).

| Pole | Typ | Popis | Použití v kódu |
|---|---|---|---|
| `Secret` | `string` | Tajný klíč pro podepisování tokenu (HS256) | `Encoding.UTF8.GetBytes(_settings.Secret)` |
| `Issuer` | `string` | Vydavatel tokenu (`iss` claim) | `issuer: _settings.Issuer` |
| `Audience` | `string` | Cílové publikum tokenu (`aud` claim) | `audience: _settings.Audience` |
| `ExpiryMinutes` | `int` | Deklarovaná délka platnosti v minutách | **Nepoužívá se** — expiry je hardcoded na `AddDays(1)` |

Hodnoty se načítají z `appsettings.json` přes `IOptions<JwtSettings>` — sekce musí být pojmenována `JwtSettings` (nebo odpovídající binding v `Program.cs`).

Příklad konfigurace v `appsettings.json`:

```json
"JwtSettings": {
  "Secret": "<min. 32 znakový tajný klíč>",
  "Issuer": "matrix-backend",
  "Audience": "matrix-client",
  "ExpiryMinutes": 1440
}
```
