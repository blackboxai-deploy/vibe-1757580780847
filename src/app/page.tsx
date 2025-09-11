'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface ScrapingStatus {
  isRunning: boolean;
  progress: number;
  total: number;
  current: string;
  error: string | null;
  completed: boolean;
  data: any[];
  filePath: string | null;
}

export default function HomePage() {
  const [config, setConfig] = useState({
    url: '',
    username: '',
    password: '',
    tableSelector: '',
    detailLinkSelector: '',
    customSelectors: ''
  });

  const [status, setStatus] = useState<ScrapingStatus>({
    isRunning: false,
    progress: 0,
    total: 0,
    current: '',
    error: null,
    completed: false,
    data: [],
    filePath: null
  });

  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (status.isRunning && !status.completed) {
      interval = setInterval(async () => {
        try {
          const response = await fetch('/api/scrape');
          const data = await response.json();
          if (data.success) {
            setStatus(data.status);
          }
        } catch (error) {
          console.error('Error fetching status:', error);
        }
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status.isRunning, status.completed]);

  const handleStartScraping = async () => {
    if (!config.url || !config.username || !config.password) {
      alert('Please fill in all required fields');
      return;
    }

    setIsStarting(true);
    
    try {
      const scrapingConfig = {
        url: config.url,
        username: config.username,
        password: config.password,
        tableSelector: config.tableSelector || undefined,
        detailLinkSelector: config.detailLinkSelector || undefined,
        dataSelectors: config.customSelectors ? JSON.parse(config.customSelectors) : undefined
      };

      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scrapingConfig),
      });

      const data = await response.json();
      
      if (data.success) {
        setStatus(prev => ({ ...prev, isRunning: true, error: null }));
      } else {
        setStatus(prev => ({ ...prev, error: data.error }));
      }
    } catch (error) {
      setStatus(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Failed to start scraping' 
      }));
    } finally {
      setIsStarting(false);
    }
  };

  const handleDownload = () => {
    if (status.filePath) {
      const fileName = status.filePath.split('/').pop();
      window.open(`/api/download?file=${fileName}`, '_blank');
    }
  };

  const resetScraping = () => {
    setStatus({
      isRunning: false,
      progress: 0,
      total: 0,
      current: '',
      error: null,
      completed: false,
      data: [],
      filePath: null
    });
  };

  return (
    <div className="space-y-8">
      {/* Configuration Section */}
      <Card>
        <CardHeader>
          <CardTitle>Scraping Configuration</CardTitle>
          <CardDescription>
            Configure your WordPress scraping parameters. Provide the URL, credentials, and optional selectors.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="url">WordPress URL *</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com/wp-admin/admin.php?page=members"
                  value={config.url}
                  onChange={(e) => setConfig(prev => ({ ...prev, url: e.target.value }))}
                  disabled={status.isRunning}
                />
              </div>
              
              <div>
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  value={config.username}
                  onChange={(e) => setConfig(prev => ({ ...prev, username: e.target.value }))}
                  disabled={status.isRunning}
                />
              </div>
              
              <div>
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={config.password}
                  onChange={(e) => setConfig(prev => ({ ...prev, password: e.target.value }))}
                  disabled={status.isRunning}
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="tableSelector">Table Selector (Optional)</Label>
                <Input
                  id="tableSelector"
                  type="text"
                  placeholder="table tbody tr"
                  value={config.tableSelector}
                  onChange={(e) => setConfig(prev => ({ ...prev, tableSelector: e.target.value }))}
                  disabled={status.isRunning}
                />
                <p className="text-sm text-gray-500 mt-1">CSS selector for table rows</p>
              </div>
              
              <div>
                <Label htmlFor="detailLinkSelector">Detail Link Selector (Optional)</Label>
                <Input
                  id="detailLinkSelector"
                  type="text"
                  placeholder="a.detail-link"
                  value={config.detailLinkSelector}
                  onChange={(e) => setConfig(prev => ({ ...prev, detailLinkSelector: e.target.value }))}
                  disabled={status.isRunning}
                />
                <p className="text-sm text-gray-500 mt-1">CSS selector for detail page links</p>
              </div>
              
              <div>
                <Label htmlFor="customSelectors">Custom Data Selectors (Optional)</Label>
                <Textarea
                  id="customSelectors"
                  placeholder='{"email": [".email", "a[href^=\"mailto:\"]"], "company": [".company", ".organization"]}'
                  value={config.customSelectors}
                  onChange={(e) => setConfig(prev => ({ ...prev, customSelectors: e.target.value }))}
                  disabled={status.isRunning}
                  rows={3}
                />
                <p className="text-sm text-gray-500 mt-1">JSON object with field names and CSS selectors</p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-4">
            <Button 
              onClick={handleStartScraping}
              disabled={status.isRunning || isStarting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isStarting ? 'Starting...' : status.isRunning ? 'Scraping in Progress' : 'Start Scraping'}
            </Button>
            
            {status.isRunning && (
              <Button 
                variant="outline" 
                onClick={resetScraping}
              >
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status Section */}
      {(status.isRunning || status.completed || status.error) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Scraping Status
              {status.isRunning && <Badge variant="secondary">Running</Badge>}
              {status.completed && <Badge variant="default">Completed</Badge>}
              {status.error && <Badge variant="destructive">Error</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {status.error}
                </AlertDescription>
              </Alert>
            )}
            
            {status.isRunning && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{status.current}</span>
                  <span>{status.progress}/{status.total}</span>
                </div>
                <Progress 
                  value={status.total > 0 ? (status.progress / status.total) * 100 : 0} 
                  className="h-2"
                />
              </div>
            )}
            
            {status.completed && (
              <div className="space-y-4">
                <Alert>
                  <AlertDescription>
                    Successfully processed {status.data.length} records!
                  </AlertDescription>
                </Alert>
                
                {status.filePath && (
                  <Button 
                    onClick={handleDownload}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Download Excel File
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data Preview */}
      {status.completed && status.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Data Preview</CardTitle>
            <CardDescription>
              Preview of the first 10 extracted records
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {Object.keys(status.data[0] || {}).map((key) => (
                      <th key={key} className="text-left p-2 font-medium">
                        {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {status.data.slice(0, 10).map((record, index) => (
                    <tr key={index} className="border-b">
                      {Object.values(record).map((value: any, colIndex) => (
                        <td key={colIndex} className="p-2 max-w-xs truncate">
                          {typeof value === 'string' ? value : JSON.stringify(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {status.data.length > 10 && (
                <p className="text-sm text-gray-500 mt-2">
                  Showing 10 of {status.data.length} records. Download the Excel file for complete data.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm text-gray-600">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">How to use:</h4>
              <ol className="list-decimal list-inside space-y-1">
                <li>Enter the WordPress admin URL where your data is located</li>
                <li>Provide your WordPress admin credentials</li>
                <li>Optionally configure CSS selectors for better data extraction</li>
                <li>Click "Start Scraping" to begin the process</li>
                <li>Monitor the progress in real-time</li>
                <li>Download the generated Excel file when complete</li>
              </ol>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Features:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Automatic WordPress login handling</li>
                <li>Smart table data extraction</li>
                <li>Detail page navigation and data collection</li>
                <li>Professional Excel file generation</li>
                <li>Real-time progress monitoring</li>
                <li>Error handling and recovery</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}