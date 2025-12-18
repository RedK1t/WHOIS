# WHOIS Backend API

Express backend server that provides WHOIS domain lookup functionality using the whoiser library. Designed to be consumed by React applications.

## Features

- 🔍 WHOIS lookup for domains and subdomains
- 🌐 CORS enabled for React app integration
- ✅ Comprehensive error handling
- 🚀 Both GET and POST endpoints
- 📝 Automatic domain cleaning and validation
- ⚡ Configurable timeout and redirect following

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
```env
PORT=3001
CORS_ORIGIN=*
```

## Usage

### Start the server

```bash
npm start
```

The server will start on port 3001 (or your configured PORT).

## API Endpoints

### Health Check
```
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "message": "WHOIS API is running",
  "timestamp": "2025-12-17T16:01:16.000Z"
}
```

### WHOIS Lookup (GET)
```
GET /api/whois/:domain
```

**Example:**
```bash
curl http://localhost:3001/api/whois/google.com
```

**Response:**
```json
{
  "success": true,
  "domain": "google.com",
  "whois": {
    "Domain Name": "google.com",
    "Registry Domain ID": "...",
    "Registrar": "MarkMonitor Inc.",
    "Creation Date": "1997-09-15T04:00:00Z",
    "Expiration Date": "2028-09-14T04:00:00Z",
    ...
  },
  "dns": {
    "domain": "google.com",
    "records": {
      "A": ["142.250.185.46"],
      "AAAA": ["2607:f8b0:4004:c07::71"],
      "MX": [{"exchange": "smtp.google.com", "priority": 10}],
      "NS": ["ns1.google.com", "ns2.google.com"],
      "TXT": [["v=spf1 include:_spf.google.com ~all"]]
    }
  },
  "timestamp": "2025-12-17T16:01:16.000Z"
}
```

**Note:** The response now includes both `whois` and `dns` data:
- `whois`: Full WHOIS registration data (null if unavailable for the TLD)
- `dns`: DNS records including A, AAAA, MX, NS, and TXT records (null if domain doesn't resolve)

### WHOIS Lookup (POST)
```
POST /api/whois
Content-Type: application/json
```

**Request Body:**
```json
{
  "domain": "github.com"
}
```

**Response:**
```json
{
  "success": true,
  "domain": "github.com",
  "whois": { /* WHOIS data */ },
  "dns": { /* DNS records */ },
  "timestamp": "2025-12-17T16:01:16.000Z"
}
```

## Error Responses

### Invalid Domain
```json
{
  "success": false,
  "error": "Domain parameter is required"
}
```

### Domain Not Found
```json
{
  "success": false,
  "error": "Domain not found or invalid"
}
```

### Timeout
```json
{
  "success": false,
  "error": "WHOIS lookup timed out. Please try again."
}
```

### Server Error
```json
{
  "success": false,
  "error": "Failed to fetch WHOIS data",
  "message": "Error details..."
}
```

## Integration with React

### Using Fetch API

```javascript
// GET request
const fetchWhois = async (domain) => {
  try {
    const response = await fetch(`http://localhost:3001/api/whois/${domain}`);
    const data = await response.json();
    
    if (data.success) {
      console.log('WHOIS Data:', data.whois);
      console.log('DNS Data:', data.dns);
      
      // Check what data is available
      if (data.whois) {
        console.log('Domain registered on:', data.whois['Creation Date']);
      }
      if (data.dns) {
        console.log('IP Addresses:', data.dns.records.A);
      }
    } else {
      console.error('Error:', data.error);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
};

// Usage
fetchWhois('google.com');
```

### Using Axios

```javascript
import axios from 'axios';

// POST request
const fetchWhois = async (domain) => {
  try {
    const response = await axios.post('http://localhost:3001/api/whois', {
      domain: domain
    });
    
    if (response.data.success) {
      console.log('WHOIS Data:', response.data.whois);
      console.log('DNS Data:', response.data.dns);
      return {
        whois: response.data.whois,
        dns: response.data.dns
      };
    }
  } catch (error) {
    if (error.response) {
      console.error('Error:', error.response.data.error);
    } else {
      console.error('Request failed:', error.message);
    }
  }
};

// Usage
fetchWhois('github.com');
```

## Domain Format

The API automatically cleans domain inputs:
- Removes `http://` or `https://` protocols
- Removes paths and query parameters
- Trims whitespace

**Examples:**
- `https://example.com/path` → `example.com`
- `subdomain.example.com` → `subdomain.example.com`
- `  example.com  ` → `example.com`

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `CORS_ORIGIN` | Allowed CORS origins | `*` |

### Production Considerations

For production deployment:

1. **Set specific CORS origin:**
```env
CORS_ORIGIN=https://your-react-app.com
```

2. **Use process manager like PM2:**
```bash
npm install -g pm2
pm2 start server.js --name whois-api
```

3. **Enable HTTPS** using a reverse proxy (nginx, Apache) or cloud provider

## Dependencies

- **express**: Web framework
- **whoiser**: WHOIS lookup library
- **cors**: Cross-Origin Resource Sharing middleware
- **dotenv**: Environment variable management

## License

ISC
