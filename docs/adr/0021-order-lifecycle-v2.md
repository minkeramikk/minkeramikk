# ADR 0021 — Ciclo di vita ordine v2: `shipped`, `contacted` dormiente, `paid_at`

**Stato**: Accepted · 2026-08-28

## Contesto

La macchina a stati dell'ordine nasce con F07 (`0001_schema.sql`, enum `order_status`):
`new → contacted → confirmed → in_production → delivered`, più `cancelled`. Un anno di
esercizio ha mostrato due scarti dalla realtà del negozio:

- **`contacted` non è mai stato usato.** Il "contatto" avviene comunque, ma non è uno stato
  dell'ordine: è una telefonata dentro `new`. Verificato con Daniele il 26/8: **zero righe
  `contacted` in produzione**.
- **Manca `shipped`.** Tra "in produzione" e "consegnato" passano giorni di trasporto dall'Italia,
  con un codice di tracciamento del corriere che oggi non ha dove stare. Per il cliente è il
  momento più informativo del ciclo.

In parallelo servono due cose che il modello non prevedeva: notificare il cliente ai passaggi
di stato (prodotto artigianale, settimane di attesa: il silenzio è il vero difetto di servizio)
e registrare l'incasso, che oggi vive solo nelle note interne.

Il vincolo tecnico che governa tutto: **da un enum Postgres non si toglie un valore** in modo
additivo — significherebbe ricreare il tipo, riscrivere le colonne che lo usano e le viste che
vi dipendono. E `ALTER TYPE ... ADD VALUE` non permette di *usare* il nuovo valore nella stessa
transazione. Con ordini reali in produzione (divieto di `db reset --linked`, AGENTS.md) ogni
cambio deve essere additivo e applicato prima del merge.

## Decisione

**1. Macchina a stati v2** (decisa con il cliente il 26/8):

```
new ──► confirmed ──► in_production ──► shipped ──► delivered
                                                    (+ cancelled da qualsiasi stato)
```

`cancelled` resta fuori linea e raggiungibile da ovunque. Nessuna guardia "forward-only" nel
backend: il negozio deve poter tornare indietro su un errore di click.

**2. `contacted` resta nell'enum, dormiente.** Il valore non si rimuove; l'applicazione lo
nasconde. In `src/lib/orders/order-status.ts` l'array cambia natura: `ORDER_STATUSES` = i sei
stati **mostrati e scrivibili**, `DORMANT_STATUSES` = i valori che esistono solo nel DB, e
`OrderStatus` è l'unione dei due. `isOrderStatus()` continua ad accettare i dormienti: una riga
storica deve conservare la propria identità invece di essere silenziosamente riletta come `new`
dal fallback di `mapOrderRow`. Label e token colore restano definiti anche per i dormienti.

*Alternativa scartata:* rimappare le righe `contacted` e ricreare il tipo. Costo e rischio non
giustificati da zero righe interessate.

**3. `shipped` entra con la sua migration dedicata** (`0030`), separata da qualunque primo uso
(`0031` aggiunge solo colonne). Regola generale da qui in avanti: un nuovo valore di enum sta
da solo nel proprio file.

**4. Il pagamento è `orders.paid_at timestamptz null`, e nient'altro.** NULL = non pagato,
timestamp = incasso registrato a mano dall'admin. Nessun enum di pagamento, nessun flag di
acconto, nessuna riga di importo: il negozio registra **un fatto** ("i soldi sono arrivati, quando").
Non genera email propria; quando è valorizzato, le email di stato portano la riga
"Betaling registrert" / "Payment registered".

*Alternativa scartata:* un `payment_status` enum (`unpaid | deposit | paid`) allineato ai due
acconti dei salgsvilkår. Modellerebbe un workflow di fatturazione che non esiste in questo
prodotto (nessun pagamento online, ADR di progetto) e che il cliente non ha chiesto.

**5. `orders.tracking_code text null`**, testo libero inserito a mano. Il passaggio a `shipped`
lo richiede: senza codice, l'admin deve confermare esplicitamente la spedizione senza tracking.

**6. Le email di stato partono solo su spunta esplicita dell'admin.** Tre stati notificano —
`confirmed`, `in_production`, `shipped` — con anteprima del testo esatto nel dialog di conferma;
`delivered` e `cancelled` sono silenziosi. Il copy NO/EN vive nel modulo puro
`src/lib/orders/status-email.ts` (stesso pattern di F30, `email-html.ts`), non in next-intl:
il rendering avviene fuori dal contesto di richiesta e deve restare puro e testabile.

**7. Scritture in RLS esistente.** I tre write (stato, tracking, pagamento) sono `update` su
`orders` con il client di sessione (anon key + RLS): li copre già la policy
"orders authenticated update" (`0002_rls.sql`). Nessuna policy nuova, nessuna RPC → il pattern
di ADR 0027 non si applica. Le server action aggiungono `getAdminUser()` (allowlist) come
difesa in profondità.

## Conseguenze

- (+) Il ciclo mostrato al negozio è quello che il negozio vive; il cliente riceve tre
  notifiche nei momenti in cui l'attesa pesa.
- (+) Tutte le modifiche sono additive: applicabili su un DB con ordini reali senza finestra
  di fermo, prima del merge.
- (+) L'incasso è interrogabile (`paid_at is not null`) invece di stare in un testo libero.
- (−) L'enum porterà per sempre un valore morto. Costo: due righe di codice (`DORMANT_STATUSES`)
  e la memoria di questo ADR. Ogni futura aggiunta di stato paga la stessa regola:
  migration separata per il valore.
- (−) `paid_at` non distingue acconto e saldo. Se serviranno (i salgsvilkår ne prevedono due),
  questa decisione va superata da un nuovo ADR, non estesa con flag.
- (−) Il copy delle email di stato non passa dai dizionari next-intl: due fonti di traduzione
  nel progetto (UI pubblica e email). Accettato, è la scelta già presa in F30.
- (?) Mittente `bestilling@minkeramikk.no`: richiede la verifica del dominio in Resend
  (azione PM). Senza `RESEND_API_KEY` il transport resta noop-log, quindi dev e CI non cambiano.
