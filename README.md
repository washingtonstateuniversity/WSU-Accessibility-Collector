# WSU Accessibility Collector

Scans and collects accessibility data for a set of URLs.

## Requirements

* Node 7.x or later.
* Elasticsearch 5.x or later.

## Configuration

Configuration is managed through a `.env` file located inside the project directory.

* `ES_HOST` defines the hostname of the Elasticsearch instance.
* `ES_INDEX` defines the index name that wsu-a11y-collector should create and use for data storage.

## Setup

Once configured, run `node setup_es.js` to create the index and define type mappings for records and urls.

## Ongoing Use

`node wsu-a11y-collector.js`
