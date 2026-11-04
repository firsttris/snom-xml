# SNOM XML Phone Book Server

A server (TypeScript, run by [Bun](https://bun.sh/)) that syncs your Google Contacts and serves them as an XML phone book compatible with Snom IP phones.

## 📚 Overview

This project creates a web server that:

- **Synchronizes with Google Contacts** - Full integration with Google People API
- Converts those contacts to Snom-compatible XML format
- Serves the phone book via HTTP for Snom phones to access
- **Provides a management dashboard** for monitoring and administration

## 🔧 Prerequisites

- [Bun](https://bun.sh/) (the version in `packageManager` of `package.json`); it runs the TypeScript directly, no build step
- Google Cloud project with People API enabled
- Snom IP phone on the same network as the server

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/firsttris/snom-xml.git
cd snom-xml

# Install dependencies
bun install

# Start the server
bun start
```

## ⚙️ Configuration

### Google Cloud Project Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google People API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google People API"
   - Click "Enable"
4. Create OAuth credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Set a name for your OAuth client
   - Add `http://localhost:3000/auth/google/callback` as an authorized redirect URI
   - Click "Create"
   - Copy your Client ID and Client Secret

### Environment Variables

Create a .env file in the project root (Bun reads it by itself when it starts in that folder):

```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## 🚀 Usage

### Server Setup

1. Start the server:

   ```bash
   bun start
   ```

2. The server will run on port 3000 by default (or the port specified in your .env file)

### Windows Service

On Windows the server can run as a service ([node-windows](https://github.com/coreybutler/node-windows), from an administrator prompt in the project root):

```bash
bun run install-service    # installs and starts the service
bun run uninstall-service
```

The service runs `src/server.ts` with the `bun.exe` that installed it (node-windows' `execPath`), in the project root as working directory, with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from `.env` at install time. node-windows keeps its files in `src/daemon/`.

### Authentication

1. Visit `http://localhost:3000/auth/google` in your browser
2. Log in with your Google account and grant permission to access your contacts
3. You'll be redirected back to the application with a success message
4. The token will be saved locally and used for future requests

### Admin Dashboard

The server includes a web-based dashboard for management:

1. Access the dashboard at `http://localhost:3000/` in your browser
2. View authentication status with Google at a glance
3. See how many contacts are currently loaded
4. Re-authenticate if necessary with one click
5. View the full phonebook XML directly from the dashboard

This dashboard is especially useful for system administrators who need to monitor or troubleshoot the service without technical knowledge.

### Google Contacts Synchronization

The server provides comprehensive Google Contacts integration:

- **Full contact synchronization** - Names and phone numbers are retrieved
- **Pagination support** - Handles large contact lists (thousands of contacts)
- **Phone number formatting** - Automatically cleans up phone numbers for Snom compatibility
- **Type mapping** - Maps Google contact types (mobile, home, work) to Snom types
- **Token management** - Handles OAuth token refresh automatically

### Configure Your Snom Phone

1. Access your Snom phone's web interface
2. Navigate to Setup > Directory
3. Set the "Directory Update URL" to:
   ```
   http://[your-server-ip]:3000/phonebook.xml
   ```
4. Adjust the "Update Interval" as needed (e.g., 3600 seconds = 1 hour)
5. If your phone supports it, set the directory source to "LDAP/Server"
6. Save and apply the settings

For detailed instructions on configuring Snom phones for XML directories, refer to the official documentation:
[Snom Remote XML Directory Documentation](https://service.snom.com/display/wiki/Remote+XML+Directory)

## 🔌 API Endpoints

- `GET /phonebook.xml`: Serves the phone book XML
- `POST /phonebook.xml`: Also serves the phone book XML (required for some Snom phones)
- `GET /auth/google`: Initiates the Google OAuth2 flow
- `GET /auth/google/callback`: OAuth2 callback URL
- `GET /api/status`: Returns server status information (for dashboard)
- `GET /`: Serves the admin dashboard

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- Google People API
- [Snom XML Directory Documentation](https://service.snom.com/display/wiki/Remote+XML+Directory)
