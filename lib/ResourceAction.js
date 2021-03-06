"use strict";
var http_1 = require('@angular/http');
var rxjs_1 = require('rxjs');
function ResourceAction(action) {
    action = action || {};
    if (action.method === undefined) {
        action.method = http_1.RequestMethod.Get;
    }
    return function (target, propertyKey) {
        target[propertyKey] = function () {
            var _this = this;
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i - 0] = arguments[_i];
            }
            var isGetRequest = action.method === http_1.RequestMethod.Get;
            var ret;
            if (action.isLazy) {
                ret = {};
            }
            else {
                ret = action.isArray ? [] : {};
            }
            var mainDeferredSubscriber = null;
            var mainObservable = null;
            ret.$resolved = false;
            ret.$observable = rxjs_1.Observable.create(function (subscriber) {
                mainDeferredSubscriber = subscriber;
            }).flatMap(function () { return mainObservable; });
            ret.$abortRequest = function () {
                ret.$resolved = true;
            };
            function releaseMainDeferredSubscriber() {
                mainDeferredSubscriber.next();
                mainDeferredSubscriber.complete();
                mainDeferredSubscriber = null;
            }
            if (!action.isLazy) {
                ret.$observable = ret.$observable.publish();
                ret.$observable.connect();
            }
            Promise.all([
                Promise.resolve(action.url || this.getUrl()),
                Promise.resolve(action.path || this.getPath()),
                Promise.resolve(action.headers || this.getHeaders()),
                Promise.resolve(action.params || this.getParams()),
                Promise.resolve(action.data || this.getData())
            ])
                .then(function (dataAll) {
                if (ret.$resolved) {
                    mainObservable = rxjs_1.Observable.create(function (observer) {
                        observer.next(null);
                    });
                    releaseMainDeferredSubscriber();
                }
                var url = dataAll[0] + dataAll[1];
                var headers = new http_1.Headers(dataAll[2]);
                var defPathParams = dataAll[3];
                var data = args.length ? args[0] : null;
                var callback = args.length > 1 ? args[1] : null;
                if (typeof data === 'function') {
                    if (!callback) {
                        callback = data;
                        data = null;
                    }
                    else if (typeof callback !== 'function') {
                        var tmpData = callback;
                        callback = data;
                        data = tmpData;
                    }
                    else {
                        data = null;
                    }
                }
                data = Object.assign({}, dataAll[4], data);
                var pathParams = url.match(/{([^}]*)}/g) || [];
                var usedPathParams = {};
                var _loop_1 = function(i) {
                    var pathParam = pathParams[i];
                    var pathKey = pathParam.substr(1, pathParam.length - 2);
                    var isMandatory = pathKey[0] === '!';
                    if (isMandatory) {
                        pathKey = pathKey.substr(1);
                    }
                    var value = getValueForPath(pathKey, defPathParams, data, usedPathParams);
                    if (!value) {
                        if (isMandatory) {
                            mainObservable = rxjs_1.Observable.create(function (observer) {
                                observer.error(new Error('Mandatory ' + pathParam + ' path parameter is missing'));
                            });
                            console.warn('Mandatory ' + pathParam + ' path parameter is missing');
                            releaseMainDeferredSubscriber();
                            return { value: void 0 };
                        }
                        url = url.substr(0, url.indexOf(pathParam));
                        return "break";
                    }
                    // Replacing in the url
                    url = url.replace(pathParam, value);
                };
                for (var i = 0; i < pathParams.length; i++) {
                    var state_1 = _loop_1(i);
                    if (typeof state_1 === "object") return state_1.value;
                    if (state_1 === "break") break;
                }
                // Removing double slashed from final url
                url = url.replace(/\/\/+/g, '/');
                if (url.startsWith('http')) {
                    url = url.replace(':/', '://');
                }
                // Remove trailing slash
                if (typeof action.removeTrailingSlash === "undefined") {
                    action.removeTrailingSlash = _this.removeTrailingSlash();
                }
                if (action.removeTrailingSlash) {
                    while (url[url.length - 1] == '/') {
                        url = url.substr(0, url.length - 1);
                    }
                }
                // Remove mapped params
                for (var key in defPathParams) {
                    if (defPathParams[key][0] === '@') {
                        delete defPathParams[key];
                    }
                }
                // Default search params or data
                var body = null;
                var searchParams;
                if (isGetRequest) {
                    // GET
                    searchParams = Object.assign({}, defPathParams, data);
                }
                else {
                    // NON GET
                    if (data) {
                        body = JSON.stringify(data);
                    }
                    searchParams = defPathParams;
                }
                // Setting search params
                var search = new http_1.URLSearchParams();
                for (var key in searchParams) {
                    if (!usedPathParams[key]) {
                        var value = searchParams[key];
                        if (typeof value == 'object') {
                            // if (value instanceof Object) {
                            value = JSON.stringify(value);
                        }
                        search.append(key, value);
                    }
                }
                // Removing Content-Type header if no body
                if (!body) {
                    headers.delete('content-type');
                }
                // Creating request options
                var requestOptions = new http_1.RequestOptions({
                    method: action.method,
                    headers: headers,
                    body: body,
                    url: url,
                    search: search
                });
                // Creating request object
                var req = new http_1.Request(requestOptions);
                req = action.requestInterceptor ?
                    action.requestInterceptor(req) :
                    _this.requestInterceptor(req);
                if (!req) {
                    mainObservable = rxjs_1.Observable.create(function (observer) {
                        observer.error(new Error('Request is null'));
                    });
                    console.warn('Request is null');
                    releaseMainDeferredSubscriber();
                    return;
                }
                // Doing the request
                var requestObservable = _this.http.request(req);
                //noinspection TypeScriptValidateTypes
                requestObservable = action.responseInterceptor ?
                    action.responseInterceptor(requestObservable, req) :
                    _this.responseInterceptor(requestObservable, req);
                if (action.isLazy) {
                    mainObservable = requestObservable;
                }
                else {
                    mainObservable = rxjs_1.Observable.create(function (subscriber) {
                        var reqSubscr = requestObservable.subscribe(function (resp) {
                            if (resp !== null) {
                                var map = action.map ? action.map : _this.map;
                                var filter = action.filter ? action.filter : _this.filter;
                                if (action.isArray) {
                                    if (!Array.isArray(resp)) {
                                        console.error('Returned data should be an array. Received', resp);
                                    }
                                    else {
                                        Array.prototype.push.apply(ret, resp.filter(filter).map(map));
                                    }
                                }
                                else {
                                    if (Array.isArray(resp)) {
                                        console.error('Returned data should be an object. Received', resp);
                                    }
                                    else {
                                        if (filter(resp)) {
                                            Object.assign(ret, map(resp));
                                        }
                                    }
                                }
                            }
                            subscriber.next(resp);
                        }, function (err) { return subscriber.error(err); }, function () {
                            ret.$resolved = true;
                            subscriber.complete();
                            if (callback) {
                                callback(ret);
                            }
                        });
                        ret.$abortRequest = function () {
                            if (ret.$resolved) {
                                return;
                            }
                            reqSubscr.unsubscribe();
                            ret.$resolved = true;
                        };
                    });
                }
                releaseMainDeferredSubscriber();
            });
            return ret;
        };
    };
}
exports.ResourceAction = ResourceAction;
function getValueForPath(key, params, data, usedPathParams) {
    if (typeof data[key] !== 'object') {
        usedPathParams[key] = true;
        return data[key];
    }
    if (!params[key]) {
        return null;
    }
    if (params[key][0] === '@') {
        return getValueForPath(params[key].substr(1), params, data, usedPathParams);
    }
    usedPathParams[key] = true;
    return params[key];
}
//# sourceMappingURL=ResourceAction.js.map