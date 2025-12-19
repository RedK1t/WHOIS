require('dotenv').config();
const express = require('express');
const cors = require('cors');
const whoiser = require('whoiser');
const dns = require('dns').promises;

const app = express();
const PORT = process.env.PORT || 3002;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Parse CORS origins (supports comma-separated list)
const allowedOrigins = CORS_ORIGIN === '*' 
  ? '*' 
  : CORS_ORIGIN.split(',').map(origin => origin.trim());

// Middleware
app.use(cors({
  origin: allowedOrigins === '*' 
    ? '*' 
    : (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
}));
app.use(express.json());

// Helper function to check if WHOIS data is valid
const isWhoisDataValid = (whoisData) => {
  if (!whoisData || Object.keys(whoisData).length === 0) {
    return false;
  }

  // Check each server's response
  for (const server in whoisData) {
    const data = whoisData[server];
    
    // Check if the response contains error messages
    if (data.text && Array.isArray(data.text)) {
      const textContent = data.text.join(' ').toLowerCase();
      
      // Common error patterns
      const errorPatterns = [
        'no entries found',
        'not found',
        'no match',
        'no data found',
        'no match for',
        'domain not found',
        '%error:',
        'no such domain',
        'status: available'
      ];
      
      // If any error pattern is found, it's not valid data
      if (errorPatterns.some(pattern => textContent.includes(pattern))) {
        return false;
      }
    }
    
    // If we have actual domain data, it's valid
    if (data['Domain Name'] || data['domain'] || data['domain name']) {
      return true;
    }
  }
  
  // If no valid domain data found in any server response
  return false;
};

// Helper function to get DNS information using hybrid approach (Native + DoH)
const getDnsInfo = async (domain) => {
  // 1. Initialize Record Types (All keys present, default null)
  const dnsInfo = {
    domain: domain,
    records: {
      A: null, AAAA: null, AFSDB: null, APL: null, CAA: null, CDNSKEY: null, CDS: null,
      CERT: null, CNAME: null, CSYNC: null, DHCID: null, DLV: null, DNAME: null,
      DNSKEY: null, DOA: null, DS: null, EUI48: null, EUI64: null, HINFO: null, HIP: null,
      HTTPS: null, IPSECKEY: null, KEY: null, KX: null, L32: null, L64: null, LOC: null,
      LP: null, MX: null, NAPTR: null, NID: null, NSEC: null, NSEC3: null, NSEC3PARAM: null,
      NS: null, OPENPGPKEY: null, PTR: null, RP: null, RRSIG: null, SIG: null, SMIMEA: null,
      SOA: null, SPF: null, SRV: null, SSHFP: null, SVCB: null, TA: null, TKEY: null,
      TLSA: null, TSIG: null, TXT: null, URI: null, ZONEMD: null, ANY: null
    }
  };

  const nativeTypes = [
    'A', 'AAAA', 'MX', 'NS', 'TXT', 'CAA', 'CNAME', 'SOA', 'SRV', 'PTR', 'NAPTR'
  ];
  
  // 3. Fetch DoH Records (Google DNS)
  // Extensive list of IANA DNS record types
  const dohTypes = [
      'AFSDB', 'APL', 'CAA', 'CDNSKEY', 'CDS', 'CERT', 'CNAME', 'CSYNC', 'DHCID', 'DLV', 
      'DNAME', 'DNSKEY', 'DOA', 'DS', 'EUI48', 'EUI64', 'HINFO', 'HIP', 'HTTPS', 
      'IPSECKEY', 'KEY', 'KX', 'L32', 'L64', 'LOC', 'LP', 'NAPTR', 'NID', 'NSEC', 
      'NSEC3', 'NSEC3PARAM', 'OPENPGPKEY', 'PTR', 'RRSIG', 'RP', 'SIG', 'SMIMEA', 
      'SOA', 'SPF', 'SRV', 'SSHFP', 'SVCB', 'TA', 'TKEY', 'TLSA', 'TSIG', 'TXT', 
      'URI', 'ZONEMD', 'ANY'
  ];

  // 2. Fetch Native Records
  const fetchNative = async () => {
    const promises = nativeTypes.map(async (type) => {
      try {
        let result;
        switch (type) {
          case 'A': result = await dns.resolve4(domain); break;
          case 'AAAA': result = await dns.resolve6(domain); break;
          case 'MX': result = await dns.resolveMx(domain); break;
          case 'NS': result = await dns.resolveNs(domain); break;
          case 'TXT': result = await dns.resolveTxt(domain); break;
          case 'CAA': result = await dns.resolveCaa(domain); break;
          case 'CNAME': result = await dns.resolveCname(domain); break;
          case 'SOA': result = await dns.resolveSoa(domain); break;
          case 'SRV': result = await dns.resolveSrv(domain); break;
          case 'PTR': result = await dns.resolvePtr(domain); break;
          case 'NAPTR': result = await dns.resolveNaptr(domain); break;
          default: result = await dns.resolve(domain, type);
        }
        if (result && result.length > 0) {
          dnsInfo.records[type] = result;
        } else if (result && !Array.isArray(result)) {
           // Some resolves return object not array (like SOA)
           dnsInfo.records[type] = [result];
        }
      } catch (e) {
        // Ignore errors, means record not found or not supported
      }
    });
    await Promise.all(promises);
  };

  // 3. Service Discovery (SRV)
  const fetchSrvVariables = async () => {
    // List of common service prefixes to check
    const srvPrefixes = [
      '_sip._tcp', '_sip._udp', 
      '_xmpp-client._tcp', '_xmpp-server._tcp',
      '_ldap._tcp', '_kerberos._tcp', 
      '_minecraft._tcp',
      '_smtp._tcp', '_imap._tcp', '_pop3._tcp', 
      '_http._tcp', '_https._tcp'
    ];
    
    // We initiate these in parallel but carefully 
    // Usually native resolveSrv is fast enough.
    // We will append to dnsInfo.records.SRV
    // Note: We initialize SRV to null above. If we find something, we verify it's an array first.
    
    const srvPromises = srvPrefixes.map(async (prefix) => {
      try {
         const result = await dns.resolveSrv(`${prefix}.${domain}`);
         if (result && result.length > 0) {
           // Tag the result with the prefix so user knows which service it is
           const labeledResults = result.map(r => ({ ...r, service: prefix }));
           if (!dnsInfo.records.SRV) dnsInfo.records.SRV = [];
           dnsInfo.records.SRV.push(...labeledResults);
         }
      } catch (e) {
        // Ignore not found
      }
    });
    
    await Promise.all(srvPromises);
  };

  // 4. Fetch DoH Records (Google DNS)
  const fetchDoH = async () => {
    // Limit concurrency to avoid rate limits or overwhelming socket
    const batchSize = 5;
    for (let i = 0; i < dohTypes.length; i += batchSize) {
      const batch = dohTypes.slice(i, i + batchSize);
      await Promise.all(batch.map(async (type) => {
        try {
          const response = await fetch(`https://dns.google/resolve?name=${domain}&type=${type}`);
          if (!response.ok) return;
          const data = await response.json();
          if (data.Answer) {
             // Basic parsing: extracting 'data' field
             const records = data.Answer.map(rec => rec.data);
             
             // If ANY query returns records, we merge them intelleigently? 
             // Or just store under 'ANY'? Storing under ANY is safer to avoid duplication if we don't parse the type field.
             // Actually, for ANY, the 'type' field in the Answer tells us what it is.
             if (type === 'ANY') {
                data.Answer.forEach(rec => {
                   // Convert type integer to string if possible, or just store.
                   // For now, let's just store specific ANY results in an 'ANY' array to show what was returned.
                   if (!dnsInfo.records.ANY) dnsInfo.records.ANY = [];
                   dnsInfo.records.ANY.push(`${rec.name} ${rec.type} ${rec.data}`); 
                });
             } else {
                dnsInfo.records[type] = records;
             }
          }
        } catch (e) {
          console.error(`DoH fetch error for ${type}:`, e.message);
        }
      }));
    }
  };

  try {
    // Run Native, SRV Discovery, and DoH in parallel
    await Promise.all([fetchNative(), fetchSrvVariables(), fetchDoH()]);
    
    return dnsInfo;
  } catch (error) {
    console.error('DNS lookup failed:', error);
    throw new Error('DNS lookup failed');
  }
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'WHOIS API is running',
    timestamp: new Date().toISOString()
  });
});

// WHOIS lookup endpoint
app.get('/api/whois/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    
    // Basic domain validation
    if (!domain || domain.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Domain parameter is required'
      });
    }

    // Clean the domain (remove protocol, paths, etc.)
    const cleanDomain = domain
      .replace(/^https?:\/\//, '') // Remove http:// or https://
      .replace(/\/.*$/, '')         // Remove paths
      .trim();

    if (!cleanDomain) {
      return res.status(400).json({
        success: false,
        error: 'Invalid domain format'
      });
    }

    console.log(`Fetching WHOIS data for: ${cleanDomain}`);

    // Fetch both WHOIS and DNS data in parallel
    const [whoisData, dnsInfo] = await Promise.allSettled([
      whoiser(cleanDomain, {
        timeout: 10000, // 10 second timeout
        follow: 3       // Follow up to 3 redirects
      }),
      getDnsInfo(cleanDomain)
    ]);

    const whoisResult = whoisData.status === 'fulfilled' ? whoisData.value : null;
    const dnsResult = dnsInfo.status === 'fulfilled' ? dnsInfo.value : null;

    // Check if we got valid WHOIS data
    const hasValidWhois = isWhoisDataValid(whoisResult);
    
    // Check if we got valid DNS data
    const hasValidDns = dnsResult && Object.values(dnsResult.records).some(records => records.length > 0);

    // If we have neither WHOIS nor DNS data, return error
    if (!hasValidWhois && !hasValidDns) {
      return res.status(404).json({
        success: false,
        error: 'No data found for this domain',
        message: 'The domain may not exist or may not be registered'
      });
    }

    // Return combined response with both WHOIS and DNS data
    const response = {
      success: true,
      domain: cleanDomain,
      whois: hasValidWhois ? whoisResult : null,
      dns: hasValidDns ? dnsResult : null,
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error('WHOIS lookup error:', error.message);
    
    // Handle specific error cases
    if (error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        error: 'WHOIS lookup timed out. Please try again.'
      });
    }

    if (error.message.includes('ENOTFOUND') || error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Domain not found or invalid'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Failed to fetch WHOIS data',
      message: error.message
    });
  }
});

// POST endpoint for batch requests (optional)
app.post('/api/whois', async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain || domain.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Domain is required in request body'
      });
    }

    // Clean the domain
    const cleanDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .trim();

    console.log(`Fetching WHOIS data for: ${cleanDomain}`);

    // Fetch both WHOIS and DNS data in parallel
    const [whoisData, dnsInfo] = await Promise.allSettled([
      whoiser(cleanDomain, {
        timeout: 10000,
        follow: 3
      }),
      getDnsInfo(cleanDomain)
    ]);

    const whoisResult = whoisData.status === 'fulfilled' ? whoisData.value : null;
    const dnsResult = dnsInfo.status === 'fulfilled' ? dnsInfo.value : null;

    // Check if we got valid WHOIS data
    const hasValidWhois = isWhoisDataValid(whoisResult);
    
    // Check if we got valid DNS data
    const hasValidDns = dnsResult && Object.values(dnsResult.records).some(records => records.length > 0);

    // If we have neither WHOIS nor DNS data, return error
    if (!hasValidWhois && !hasValidDns) {
      return res.status(404).json({
        success: false,
        error: 'No data found for this domain',
        message: 'The domain may not exist or may not be registered'
      });
    }

    // Return combined response with both WHOIS and DNS data
    const response = {
      success: true,
      domain: cleanDomain,
      whois: hasValidWhois ? whoisResult : null,
      dns: hasValidDns ? dnsResult : null,
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error('WHOIS lookup error:', error.message);
    
    if (error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        error: 'WHOIS lookup timed out. Please try again.'
      });
    }

    if (error.message.includes('ENOTFOUND') || error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Domain not found or invalid'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch WHOIS data',
      message: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server (only for local development)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 WHOIS API server running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔍 WHOIS endpoint: http://localhost:${PORT}/api/whois/:domain`);
  });
}

// Export for Vercel serverless
module.exports = app;
