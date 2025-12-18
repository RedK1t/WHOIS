require('dotenv').config();
const express = require('express');
const cors = require('cors');
const whoiser = require('whoiser');
const dns = require('dns').promises;

const app = express();
const PORT = process.env.PORT || 3002;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Middleware
app.use(cors({
  origin: CORS_ORIGIN
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

// Helper function to get DNS information as fallback
const getDnsInfo = async (domain) => {
  const dnsInfo = {
    domain: domain,
    records: {}
  };

  try {
    // Get A records (IPv4)
    try {
      const aRecords = await dns.resolve4(domain);
      dnsInfo.records.A = aRecords;
    } catch (e) {
      dnsInfo.records.A = [];
    }

    // Get AAAA records (IPv6)
    try {
      const aaaaRecords = await dns.resolve6(domain);
      dnsInfo.records.AAAA = aaaaRecords;
    } catch (e) {
      dnsInfo.records.AAAA = [];
    }

    // Get MX records (Mail servers)
    try {
      const mxRecords = await dns.resolveMx(domain);
      dnsInfo.records.MX = mxRecords;
    } catch (e) {
      dnsInfo.records.MX = [];
    }

    // Get NS records (Name servers)
    try {
      const nsRecords = await dns.resolveNs(domain);
      dnsInfo.records.NS = nsRecords;
    } catch (e) {
      dnsInfo.records.NS = [];
    }

    // Get TXT records
    try {
      const txtRecords = await dns.resolveTxt(domain);
      dnsInfo.records.TXT = txtRecords;
    } catch (e) {
      dnsInfo.records.TXT = [];
    }

    return dnsInfo;
  } catch (error) {
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
