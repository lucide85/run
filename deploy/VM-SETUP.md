# Sette opp app-VM (Hyper-V + Ubuntu Server 24.04 + Docker)

Steg-for-steg for å lage en ny VM på Hyper-V, installere Docker, og kjøre Treningsapp
der via GitHub. Når dette er gjort, kobler du den til Traefik – se «Publisering hjemme med
Docker + Traefik» i [`../README.md`](../README.md).

---

## Del A – Push koden til GitHub (gjøres på Windows-PC-en)

Repoet er allerede initialisert og committet lokalt (gren `main`).

1. Opprett et **nytt, tomt repo** på <https://github.com/new>:
   - Navn: f.eks. `treningsapp`
   - **Privat** anbefales (men det er trygt offentlig også – `config.json` og databasen er
     `.gitignore`-et og finnes ikke i repoet).
   - **Ikke** kryss av for README/license/.gitignore (repoet finnes allerede).
2. Koble til og push (bytt `<bruker>` med GitHub-brukernavnet ditt):
   ```powershell
   cd "C:\Users\viave\OneDrive - Vitec Software Group AB (publ)\Claude\10k treningsprogram"
   git remote add origin https://github.com/<bruker>/treningsapp.git
   git push -u origin main
   ```
   Første push åpner en nettleser for GitHub-innlogging (Git Credential Manager). Logg inn.

> Trenger du å oppdatere senere: `git add -A && git commit -m "..." && git push`.

---

## Del B – Lag VM-en i Hyper-V

1. **Last ned ISO:** Ubuntu Server 24.04 LTS fra <https://ubuntu.com/download/server>
   (filen heter f.eks. `ubuntu-24.04.x-live-server-amd64.iso`). Legg den f.eks. i `C:\ISO\`.

2. **(Hvis du mangler ekstern nettverkssvitsj):** Hyper-V Manager →
   *Virtual Switch Manager* → **New virtual network switch** → **External** →
   knytt til det fysiske nettverkskortet → OK. (Gir VM-en en egen IP på hjemmenettet,
   slik at Traefik-VM-en kan nå den.)

3. **Hyper-V Manager → Action → New → Virtual Machine:**
   | Steg | Valg |
   |---|---|
   | Name | `treningsapp-vm` |
   | Generation | **Generation 2** |
   | Memory | **4096 MB** (gjerne «Use Dynamic Memory») |
   | Network | Den **eksterne** svitsjen fra punkt 2 |
   | Virtual hard disk | Ny, **40 GB** |
   | Installation options | *Install OS from a bootable image file* → velg Ubuntu-ISO-en |

4. **Før du starter VM-en:** høyreklikk VM → **Settings**:
   - **Security → Secure Boot:** bytt *Template* til
     **«Microsoft UEFI Certificate Authority»** (ellers booter ikke Ubuntu).
   - **Processor:** sett **2–4** virtuelle prosessorer (raskere Docker-bygg).

5. **Start** VM-en → **Connect** → følg Ubuntu-installasjonen:
   - Språk/tastatur, nettverk (la den få DHCP foreløpig).
   - Noter deg brukernavn/passord du oppretter.
   - **Viktig:** kryss av for **«Install OpenSSH server»** (så du kan SSH-e inn).
   - Fullfør, fjern ISO-en (Media → Eject) og reboot.

6. **Finn IP-en** (i VM-konsollen): `ip a` → noter adressen (f.eks. `192.168.1.50`).
   Du kan nå SSH-e fra PC-en: `ssh <bruker>@192.168.1.50`.

---

## Del C – Gi VM-en en fast IP (så Traefik alltid finner den)

Enklest: lag en **DHCP-reservasjon** på hjemmeruteren for VM-ens MAC-adresse.

Alternativt statisk via netplan på VM-en (bytt verdier til ditt nett):
```bash
sudo nano /etc/netplan/50-cloud-init.yaml
```
```yaml
network:
  version: 2
  ethernets:
    eth0:                      # sjekk navnet med: ip a
      dhcp4: false
      addresses: [192.168.1.50/24]
      routes:
        - to: default
          via: 192.168.1.1     # ruterens IP
      nameservers:
        addresses: [192.168.1.1, 1.1.1.1]
```
```bash
sudo netplan apply
```

---

## Del D – Installer Docker på VM-en

Kjør på VM-en (offisiell Docker-pakkekilde):
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Kjør docker uten sudo
sudo usermod -aG docker $USER
newgrp docker        # eller logg ut/inn

# Test
docker run hello-world
docker compose version
```

---

## Del E – Hent og start appen

```bash
# Privat repo? Bruk et Personal Access Token (PAT) som passord når git spør.
# Lag PAT: GitHub → Settings → Developer settings → Tokens (classic) → scope "repo".
git clone https://github.com/<bruker>/treningsapp.git
cd treningsapp

# Lag config med dine hemmeligheter
cp config.example.json config.json
nano config.json
```

Fyll inn i `config.json` (se tabell i README): `auth.username/password`, `auth.nickname`,
`anthropic.apiKey`, `server.port` = **3001**, og lange tilfeldige strenger i
`server.sessionSecret` og `server.encryptionKey`.

```bash
# Bygg og start (kjører i bakgrunnen, starter automatisk ved boot)
docker compose up -d --build

# Følg loggen – skal vise «🏃 Treningsapp-server kjører …»
docker compose logs -f

# Lokal test på VM-en
curl -I http://localhost:3001
```

Tillat at Traefik-VM-en når port 3001:
```bash
sudo ufw allow from <TRAEFIK_VM_IP> to any port 3001 proto tcp
```

---

## Del F – Koble til Traefik

Gå videre til **«Steg 3–5»** i README-seksjonen «Publisering hjemme med Docker + Traefik».
Kort fortalt: kopier [`traefik/treningsapp.yml`](traefik/treningsapp.yml) til Traefiks
dynamiske mappe på Traefik-VM-en, og sett inn domenet ditt + denne VM-ens IP (`...:3001`).

## Oppdatere senere
```bash
cd treningsapp && git pull && docker compose up -d --build   # data beholdes
```
