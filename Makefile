build:
	rm -f wsu-a11y-collector.tar
	rm -rf build-package
	mkdir build-package
	cp package*.json build-package/
	cp a11y.js build-package/
	cp setup_es.js build-package/
	rm -rf ./build-package/etc
	tar --create --file=wsu-a11y-collector.tar build-package

deploy:
	scp wsu-a11y-collector.tar wsuwp-indie-prod-01:/home/ucadmin/web-crawler/
