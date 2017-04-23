# WSU A11y Collector

Scans and collects accessibility data for a set of URLs.

WSU A11y Collector uses [Pa11y](https://github.com/pa11y/pa11y), which is powered by [HTML CodeSniffer](https://github.com/squizlabs/HTML_CodeSniffer) to check a document's HTML code against a standard set of rules.

When errors (records) are found for a given URL, they are stored in an Elasticsearch index to be displayed at a later time in a dashboard, similar to the [WSU A11y Dashboard](https://github.com/washingtonstateuniversity/WSU-A11y-Dashboard).

## Requirements

This tool works alongside [WSU Web Crawler](https://github.com/washingtonstateuniversity/WSU-Web-Crawler), which harvests URLs and logs them in a separate Elasticsearch index for future processing. This should be setup and URLs should be indexed before the WSU A11y Collector is started.

* Node 7.x or later.
* Elasticsearch 5.2.x or later.

## Configuration

Configuration is managed through a `.env` file located inside the project directory.

* `ES_HOST` defines the hostname of the Elasticsearch instance.
* `ES_INDEX` defines the index name that wsu-a11y-collector should create and use for data storage.
* `ES_URL_INDEX` defines the index used by the WSU Web Crawler to store URL data.
* `SKIP_DOMAINS` defines a list of comma separated domains that should not be scanned with this tool.
## Setup

Once configured, run `node setup_es.js` to create the index and define type mappings for accessibility records.

## Start

Run `node index.js` to start the script. As long as URLs exist to be scanned in the index created by WSU Web Crawler, then the script will continue scanning them each at 1.5 second intervals.
