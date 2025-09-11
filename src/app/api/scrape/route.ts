import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Page, Browser } from 'puppeteer';
import ExcelJS from 'exceljs';
import { join } from 'path';

interface ScrapedData {
  firstName: string;
  lastName: string;
  email?: string;
  website?: string;
  company?: string;
  [key: string]: any;
}

interface ScrapingConfig {
  url: string;
  username: string;
  password: string;
  tableSelector?: string;
  detailLinkSelector?: string;
  dataSelectors?: Record<string, string>;
}

let scrapingStatus = {
  isRunning: false,
  progress: 0,
  total: 0,
  current: '',
  error: null as string | null,
  completed: false,
  data: [] as ScrapedData[],
  filePath: null as string | null
};

export async function POST(request: NextRequest) {
  try {
    const config: ScrapingConfig = await request.json();

    if (scrapingStatus.isRunning) {
      return NextResponse.json({ 
        success: false, 
        error: 'Scraping is already in progress' 
      }, { status: 400 });
    }

    // Reset status
    scrapingStatus = {
      isRunning: true,
      progress: 0,
      total: 0,
      current: 'Initializing...',
      error: null,
      completed: false,
      data: [],
      filePath: null
    };

    // Start scraping in background
    startScraping(config);

    return NextResponse.json({ 
      success: true, 
      message: 'Scraping started successfully' 
    });

  } catch (error) {
    scrapingStatus.isRunning = false;
    scrapingStatus.error = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({ 
      success: false, 
      error: scrapingStatus.error 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    success: true, 
    status: scrapingStatus 
  });
}

async function startScraping(config: ScrapingConfig) {
  let browser = null;

  try {
    scrapingStatus.current = 'Launching browser...';
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    scrapingStatus.current = 'Navigating to login page...';
    await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });

    // WordPress login handling
    scrapingStatus.current = 'Authenticating...';
    await handleWordPressLogin(page, config.username, config.password);

    scrapingStatus.current = 'Extracting table data...';
    const tableData = await extractTableData(page, config);
    
    scrapingStatus.total = tableData.length;
    scrapingStatus.current = `Found ${tableData.length} records. Processing details...`;

    // Process each record to get detailed information
    const detailedData = await processDetailedData(page, tableData, config);
    
    scrapingStatus.current = 'Generating Excel file...';
    const filePath = await generateExcelFile(detailedData);
    
    scrapingStatus.data = detailedData;
    scrapingStatus.filePath = filePath;
    scrapingStatus.completed = true;
    scrapingStatus.current = `Completed! Processed ${detailedData.length} records.`;

  } catch (error) {
    scrapingStatus.error = error instanceof Error ? error.message : 'Unknown error occurred';
    scrapingStatus.current = `Error: ${scrapingStatus.error}`;
  } finally {
    if (browser) {
      await browser.close();
    }
    scrapingStatus.isRunning = false;
  }
}

async function handleWordPressLogin(page: Page, username: string, password: string) {
  // Common WordPress login selectors
  const loginSelectors = [
    '#user_login',
    '#log',
    'input[name="log"]',
    'input[name="username"]',
    'input[type="email"]'
  ];

  const passwordSelectors = [
    '#user_pass',
    '#pwd',
    'input[name="pwd"]',
    'input[name="password"]',
    'input[type="password"]'
  ];

  const submitSelectors = [
    '#wp-submit',
    'input[type="submit"]',
    'button[type="submit"]',
    '.wp-submit'
  ];

  // Find and fill login form
  let loginField = null;
  for (const selector of loginSelectors) {
    try {
      loginField = await page.$(selector);
      if (loginField) break;
    } catch (e) {
      continue;
    }
  }

  let passwordField = null;
  for (const selector of passwordSelectors) {
    try {
      passwordField = await page.$(selector);
      if (passwordField) break;
    } catch (e) {
      continue;
    }
  }

  if (loginField && passwordField) {
    await loginField.type(username);
    await passwordField.type(password);

    // Find and click submit button
    for (const selector of submitSelectors) {
      try {
        const submitBtn = await page.$(selector);
        if (submitBtn) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
            submitBtn.click()
          ]);
          break;
        }
      } catch (e) {
        continue;
      }
    }
  }

  // Wait for login to complete
  await new Promise(resolve => setTimeout(resolve, 3000));
}

async function extractTableData(page: Page, config: ScrapingConfig) {
  const tableSelector = config.tableSelector || 'table tbody tr';
  
  // Wait for table to load
  await page.waitForSelector(tableSelector, { timeout: 10000 });

  return await page.evaluate((selector: string) => {
    const rows = document.querySelectorAll(selector);
    const data: any[] = [];

    rows.forEach((row: Element) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const firstName = cells[0]?.textContent?.trim() || '';
        const lastName = cells[1]?.textContent?.trim() || '';
        
        // Find detail link
        const detailLink = row.querySelector('a[href]');
        const detailUrl = detailLink ? detailLink.getAttribute('href') : null;

        data.push({
          firstName,
          lastName,
          detailUrl: detailUrl ? new URL(detailUrl, window.location.origin).href : null
        });
      }
    });

    return data;
  }, tableSelector);
}

async function processDetailedData(page: Page, tableData: any[], config: ScrapingConfig) {
  const detailedData: ScrapedData[] = [];

  for (let i = 0; i < tableData.length; i++) {
    const record = tableData[i];
    scrapingStatus.progress = i + 1;
    scrapingStatus.current = `Processing ${record.firstName} ${record.lastName} (${i + 1}/${tableData.length})`;

    try {
      if (record.detailUrl) {
        await page.goto(record.detailUrl, { waitUntil: 'networkidle2', timeout: 15000 });
        
        // Extract detailed information
        const details = await extractDetailedInfo(page, config);
        
        detailedData.push({
          firstName: record.firstName,
          lastName: record.lastName,
          ...details
        });
      } else {
        detailedData.push({
          firstName: record.firstName,
          lastName: record.lastName
        });
      }

      // Add delay to be respectful to the server
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`Error processing ${record.firstName} ${record.lastName}:`, error);
      
      // Add record with basic info even if detail extraction fails
      detailedData.push({
        firstName: record.firstName,
        lastName: record.lastName,
        error: 'Failed to extract details'
      });
    }
  }

  return detailedData;
}

async function extractDetailedInfo(page: Page, config: ScrapingConfig) {
  const defaultSelectors = {
    email: [
      'a[href^="mailto:"]',
      '.email',
      '[data-email]',
      'input[type="email"]',
      'span:contains("@")',
      'div:contains("@")'
    ],
    website: [
      'a[href^="http"]',
      '.website',
      '.url',
      '[data-url]',
      'input[type="url"]'
    ],
    company: [
      '.company',
      '.organization',
      '.org',
      '[data-company]',
      'input[name*="company"]'
    ]
  };

  const selectors = { ...defaultSelectors, ...config.dataSelectors };

  return await page.evaluate((selectorMap: any) => {
    const extractedData: any = {};

    Object.keys(selectorMap).forEach(field => {
      const fieldSelectors = selectorMap[field];
      let value = '';

      for (const selector of fieldSelectors) {
        try {
          if (field === 'email') {
            // Special handling for email
            const emailLink = document.querySelector(selector);
            if (emailLink) {
              const href = emailLink.getAttribute('href');
              if (href && href.startsWith('mailto:')) {
                value = href.replace('mailto:', '');
                break;
              }
              const text = emailLink.textContent || '';
              if (text.includes('@')) {
                value = text.trim();
                break;
              }
            }
            
            // Search for email in text content
            const element = document.querySelector(selector);
            if (element) {
              const text = element.textContent || '';
              const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
              if (emailMatch) {
                value = emailMatch[0];
                break;
              }
            }
          } else if (field === 'website') {
            // Special handling for website
            const link = document.querySelector(selector);
            if (link) {
              const href = link.getAttribute('href');
              if (href && (href.startsWith('http') || href.startsWith('www'))) {
                value = href.startsWith('www') ? 'https://' + href : href;
                break;
              }
            }
          } else {
            // General text extraction
            const element = document.querySelector(selector);
            if (element) {
              value = element.textContent?.trim() || '';
              if (value) break;
            }
          }
        } catch (e) {
          continue;
        }
      }

      if (value) {
        extractedData[field] = value;
      }
    });

    return extractedData;
  }, selectors);
}

async function generateExcelFile(data: ScrapedData[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Scraped Data');

  // Get all unique columns from data
  const allColumns = new Set<string>();
  data.forEach(record => {
    Object.keys(record).forEach(key => allColumns.add(key));
  });

  const columns = Array.from(allColumns);

  // Add headers
  worksheet.columns = columns.map(col => ({
    header: col.charAt(0).toUpperCase() + col.slice(1).replace(/([A-Z])/g, ' $1'),
    key: col,
    width: col === 'email' ? 30 : col === 'website' ? 40 : 20
  }));

  // Add data
  data.forEach(record => {
    worksheet.addRow(record);
  });

  // Style the header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE6F2FF' }
  };

  // Auto-filter
  worksheet.autoFilter = {
    from: 'A1',
    to: `${String.fromCharCode(64 + columns.length)}${data.length + 1}`
  };

  // Save file
  const fileName = `scraped_data_${new Date().toISOString().split('T')[0]}.xlsx`;
  const filePath = join(process.cwd(), 'public', fileName);
  
  await workbook.xlsx.writeFile(filePath);
  
  return `/` + fileName;
}