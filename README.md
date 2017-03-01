# WSU A11y Collector

Scans and collects accessibility data for a set of URLs.

WSU A11y Collector uses [Pa11y](https://github.com/pa11y/pa11y), which is powered by [HTML CodeSniffer](https://github.com/squizlabs/HTML_CodeSniffer) to check a document's HTML code against a standard set of rules.

When errors (records) are found for a given URL, they are stored in an Elasticsearch index to be displayed at a later time in a dashboard, similar to the [WSU A11y Dashboard](https://github.com/washingtonstateuniversity/WSU-A11y-Dashboard).

## Requirements

* Node 7.x or later.
* Elasticsearch 5.2.x or later.

## Configuration

Configuration is managed through a `.env` file located inside the project directory.

* `ES_HOST` defines the hostname of the Elasticsearch instance.
* `ES_INDEX` defines the index name that wsu-a11y-collector should create and use for data storage.

## Setup

Once configured, run `node setup_es.js` to create the index and define type mappings for records and urls.

## Ongoing Use

Run the script with a single URL as the argument

* `node index.js https://wsu.edu`
