# WSU Accessibility Collector

A node script to scan and collect accessibility data for a set of URLs.

WSU Accessibility Collector uses [Pa11y](https://github.com/pa11y/pa11y), which is powered by [HTML CodeSniffer](https://github.com/squizlabs/HTML_CodeSniffer), to check a document's HTML code for accessibility violations per the guidelines provided by [WCAG 2.0 AA](https://www.w3.org/TR/WCAG20/).

Data is stored in an Elasticsearch index so that it can be displayed in a dashboard like the [WSU Accessibility Dashboard](https://github.com/washingtonstateuniversity/WSU-A11y-Dashboard).

## Requirements

This tool works alongside [WSU Web Crawler](https://github.com/washingtonstateuniversity/WSU-Web-Crawler), which harvests URLs and logs them in a separate Elasticsearch index for future processing. This should be setup and URLs should be indexed before the accessibility collector is started.

* Node 7.x or later.
* Elasticsearch 5.2.x or later.

## Configuration

Configuration is managed through a `.env` file located inside the project directory. It should have values like:

```
ES_HOST="https://myelastic.domain"
ES_INDEX="a11y-storage-index"
ES_URL_INDEX="url-storage-index"
LOCK_KEY=2001
```

* `ES_HOST` defines the hostname of the Elasticsearch instance.
* `ES_INDEX` defines the index name that wsu-a11y-collector should create and use for data storage.
* `ES_URL_INDEX` defines the index used by the WSU Web Crawler to store URL data.
* `LOCK_KEY` defines an ID used by the collector so that multiple collector instances can exist.

## Setup

Once configured, run `node setup_es.js` to create the index and define type mappings for accessibility records.

## Start

Run `node a11y.js` to start the script. As long as URLs exist to be scanned in the index created by WSU Web Crawler, then the script will continue scanning them each at 1.5 second intervals.
