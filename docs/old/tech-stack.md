# Tech stack — Matrix Backend

Cílový framework: `net8.0` (ASP.NET Core 8 Web API)
Namespace: `matrixBackend`. Port: `8080` (HTTP, všechna rozhraní).

## NuGet závislosti

| Balíček | Verze | Účel |
|---|---|---|
| BCrypt.Net-Next | 4.0.3 | Hashování hesel |
| Google.Apis.Drive.v3 | 1.69.0.3740 | Integrace Google Drive |
| Lucene.Net | 4.8.0-beta00016 | Full-text vyhledávání |
| Lucene.Net.Analysis.Common | 4.8.0-beta00016 | Analyzátory pro Lucene |
| Lucene.Net.QueryParser | 4.8.0-beta00016 | Query parser pro Lucene |
| Microsoft.AspNetCore.Authentication.JwtBearer | 8.0.1 | JWT Bearer autentifikace |
| Microsoft.AspNetCore.ResponseCompression | 2.3.0 | GZip + Brotli komprese |
| MongoDB.Driver | 3.3.0 | Přístup k MongoDB |
| Newtonsoft.Json | 13.0.3 | JSON serializace |
| Swashbuckle.AspNetCore | 6.6.2 | Swagger / OpenAPI |
| Microsoft.ML | 4.0.2 | ML.NET pipeline |
| Microsoft.ML.OnnxRuntime | 1.23.1 | ONNX inference pro embedding modely |
| Lokad.Tokenizers | 0.1.0 | SentencePiece tokenizace |
| Accord.Math | 3.8.0 | Matematické operace (kosinusová podobnost) |
| WebPush | 1.0.12 | Odesílání Web Push notifikací |

## Poznámky k projektu

- Adresář `Tools\**\*.cs` je explicitně vyloučen z kompilace (také `EmbeddedResource` a `None`).
- `UserSecretsId`: `babdc6d6-fb12-4ea5-8c73-f88e2dc1f142` — citlivé hodnoty (JWT secret, VAPID klíče, MongoDB connection string) se přepisují přes User Secrets nebo prostředí.
- `<NoWarn>CS8618</NoWarn>` — potlačeno varování o neinicializovaných non-nullable polích (používají se v Options třídách).
- JSON serializace controllerů: `camelCase`, case-insensitive, enums jako stringy.
