import { canAccess } from '@wdio/utils'

import NetworkInterception from '../../../src/utils/interception/devtools'

const fse = jest.requireActual('fs-extra')

jest.mock('fs-extra', () => {
    const fseOrig = jest.requireActual('fs-extra')
    const pathExists = fseOrig.pathExists
    fseOrig.pathExists = async (filepath) => {
        if (filepath.endsWith('/missing/mock-file.txt')) {
            return true
        }
        return pathExists(filepath)
    }
    return fseOrig
})

const cdpClient = {
    send: jest.fn().mockReturnValue(Promise.resolve({
        body: 'eyJmb28iOiJiYXIifQ==',
        base64Encoded: true
    }))
}

beforeEach(() => {
    cdpClient.send.mockClear()
})

test('allows to access network calls', async () => {
    const mock = new NetworkInterception('**/foobar/**')
    await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
        request: { url: 'http://test.com/foobar/test.html' },
        responseHeaders: []
    })
    await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
        request: { url: 'http://test.com/barfoo/test.html' },
        responseHeaders: []
    })
    expect(mock.calls.length).toBe(1)
})

describe('filter network calls by header', () => {
    const mockWithCall = async (filter) => {
        const mock = new NetworkInterception('**/foobar/**', filter)
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            request: { url: 'http://test.com/foobar/test1.html', method: 'put' },
            responseHeaders: [{ name: 'Content-Type', value: 'text/xml' }]
        })
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            request: { url: 'http://test.com/foobar/test2.html', method: 'put' },
            responseHeaders: [{ name: 'Content-Type', value: 'foobar' }]
        })
        return mock
    }

    test('1 match', async () => {
        const mock = await mockWithCall({
            method: 'put',
            headers: { 'Content-Type': 'text/xml' }
        })

        expect(mock.calls.length).toBe(1)
        expect(mock.calls[0].url).toBe('http://test.com/foobar/test1.html')
    })

    test('no match value', async () => {
        const mock = await mockWithCall({
            headers: { 'Content-Type': 'no match' }
        })
        expect(mock.calls.length).toBe(0)
    })

    test('no match key', async () => {
        const mock = await mockWithCall({
            headers: { 'foo': 'bar' }
        })
        expect(mock.calls.length).toBe(0)
    })

    test('comparator fn', async () => {
        const mock = await mockWithCall({
            headers: (headers) => Object.entries(headers).some(([, value]) => value.includes('xml'))
        })
        expect(mock.calls.length).toBe(1)
        expect(mock.calls[0].url).toBe('http://test.com/foobar/test1.html')
    })
})

describe('filter network calls by postData', () => {
    const mockWithCall = async (filter) => {
        const mock = new NetworkInterception('**/foobar/**', filter)
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            request: { url: 'http://test.com/foobar/test1.html', method: 'post', postData: JSON.stringify({ foo: { bar: 'baz' } }) },
            responseHeaders: []
        })
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            request: { url: 'http://test.com/foobar/test2.html', method: 'post', postData: 'foobar' },
            responseHeaders: []
        })
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            request: { url: 'http://test.com/foobar/test3.html', method: 'get' },
            responseHeaders: []
        })
        return mock
    }

    test('exact match', async () => {
        const mock = await mockWithCall({
            postData: 'foobar'
        })

        expect(mock.calls.length).toBe(1)
        expect(mock.calls[0].url).toBe('http://test.com/foobar/test2.html')
    })

    test('function comparator', async () => {
        const mock = await mockWithCall({
            postData: (postData) => {
                if (typeof postData !== 'string') {
                    return false
                }
                try {
                    return JSON.parse(postData).foo.bar === 'baz'
                } catch {
                    return false
                }
            }
        })

        expect(mock.calls.length).toBe(1)
        expect(mock.calls[0].url).toBe('http://test.com/foobar/test1.html')
    })
})

describe('filter network calls by statusCode', () => {
    const mockWithCall = async (filter) => {
        const mock = new NetworkInterception('**/foobar/**', filter)
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            request: { url: 'http://test.com/foobar/test1.html', method: 'post' },
            responseHeaders: [],
            responseStatusCode: 200
        })
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            request: { url: 'http://test.com/foobar/test2.html', method: 'post' },
            responseHeaders: [],
            responseStatusCode: 203
        })
        return mock
    }

    test('exact match', async () => {
        const mock = await mockWithCall({
            statusCode: 203
        })

        expect(mock.calls.length).toBe(1)
        expect(mock.calls[0].url).toBe('http://test.com/foobar/test2.html')
    })

    test('comparator fn', async () => {
        const mock = await mockWithCall({
            statusCode: (statusCode) => statusCode >= 200 && statusCode <= 201
        })

        expect(mock.calls.length).toBe(1)
        expect(mock.calls[0].url).toBe('http://test.com/foobar/test1.html')
    })
})

describe('filter network calls by method', () => {
    const mockWithCall = async (filter) => {
        const mock = new NetworkInterception('**/foobar/**', filter)
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            request: { url: 'http://test.com/foobar/test1.html', method: 'PUT' },
            responseHeaders: []
        })
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            request: { url: 'http://test.com/foobar/test2.html', method: 'POST' },
            responseHeaders: []
        })
        return mock
    }

    test('exact match', async () => {
        const mock = await mockWithCall({
            method: 'put'
        })

        expect(mock.calls.length).toBe(1)
        expect(mock.calls[0].url).toBe('http://test.com/foobar/test1.html')
    })

    test('comparator fn', async () => {
        const mock = await mockWithCall({
            method: (method) => method.toLowerCase() === 'post'
        })

        expect(mock.calls.length).toBe(1)
        expect(mock.calls[0].url).toBe('http://test.com/foobar/test2.html')
    })
})

test('decodes base64 responses', async () => {
    const mock = new NetworkInterception('**/foobar/**')
    await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
        request: { url: 'http://test.com/foobar/test.html' },
        responseHeaders: [{ name: 'content-Type', value: 'application/json' }]
    })
    await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
        request: { url: 'http://test.com/foobar/test.html' },
        responseHeaders: [{ name: 'Content-Type', value: 'foobar' }]
    })

    expect(mock.calls[0].body).toEqual({ foo: 'bar' })
    expect(mock.calls[1].body).toBe('{"foo":"bar"}')
})

test('abort request', async () => {
    const request = {
        requestId: 123,
        request: { url: 'http://test.com/foobar/test.html' },
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }]
    }
    const mock = new NetworkInterception('**/foobar/**')
    expect(mock.abort.bind(mock)).toThrow()
    expect(() => mock.abort('foobar')).toThrow()

    mock.abortOnce('NameNotResolved')
    mock.abort('ConnectionFailed')
    await NetworkInterception.handleRequestInterception(cdpClient, [mock])(request)
    expect(cdpClient.send).toBeCalledWith(
        'Fetch.failRequest',
        {
            requestId: 123,
            errorReason: 'NameNotResolved'
        }
    )

    await NetworkInterception.handleRequestInterception(cdpClient, [mock])(request)
    expect(cdpClient.send).toBeCalledWith(
        'Fetch.failRequest',
        {
            requestId: 123,
            errorReason: 'ConnectionFailed'
        }
    )

    await NetworkInterception.handleRequestInterception(cdpClient, [mock])(request)
    expect(cdpClient.send).toBeCalledWith(
        'Fetch.failRequest',
        {
            requestId: 123,
            errorReason: 'ConnectionFailed'
        }
    )
})

describe('stub request', () => {
    test('with a function', async () => {
        const mock = new NetworkInterception('**/foobar/**')
        mock.respond(() => 'foobar')
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            requestId: 123,
            request: { url: 'http://test.com/foobar/test.html' },
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }]
        })

        expect(cdpClient.send.mock.calls.pop()).toMatchSnapshot()
    })

    test('with a function returning undefined', async () => {
        const mock = new NetworkInterception('**/foobar/**')
        mock.respond(() => undefined)
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            requestId: 123,
            request: { url: 'http://test.com/foobar/test.html' },
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }]
        })

        expect(cdpClient.send.mock.calls.pop()).toMatchSnapshot()
    })

    test('with an object', async () => {
        const mock = new NetworkInterception('**/foobar/**')
        mock.respond({ foo: 'bar' })
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            requestId: 123,
            request: { url: 'http://test.com/foobar/test.html' },
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }]
        })

        expect(cdpClient.send.mock.calls.pop()).toMatchSnapshot()
    })

    test('with a text', async () => {
        const mock = new NetworkInterception('**/foobar/**')
        mock.respond('foobar')
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            requestId: 123,
            request: { url: 'http://test.com/foobar/test.html' },
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }]
        })

        expect(cdpClient.send.mock.calls.pop()).toMatchSnapshot()
    })

    test('with a file', async () => {
        const mock = new NetworkInterception('**/foobar/**')
        const fileContent = (await fse.readFileSync(__filename)).toString('base64')
        mock.respond(__filename)
        canAccess.mockImplementation(() => true)
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            requestId: 123,
            request: { url: 'http://test.com/foobar/test.html' },
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }]
        })

        const response = cdpClient.send.mock.calls.pop()[1]
        expect(response.body).toEqual(fileContent)
    })

    test('with a missing file', async () => {
        const mock = new NetworkInterception('**/foobar/**')
        const filepath = __filename + '/missing/mock-file.txt'
        mock.respond(filepath)
        canAccess.mockImplementation(() => true)
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            requestId: 123,
            request: { url: 'http://test.com/foobar/test.html' },
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }]
        })

        const response = cdpClient.send.mock.calls.pop()[1]
        expect(response.body).toEqual(Buffer.from(filepath, 'binary').toString('base64'))
    })

    test('with a different web resource', async () => {
        const mock = new NetworkInterception('**/foobar/**')
        mock.respond('http://json.org/image.svg')
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            requestId: 123,
            request: { url: 'http://test.com/foobar/test.html' },
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }]
        })

        expect(cdpClient.send.mock.calls.pop()[1].responseHeaders).toMatchSnapshot()
    })

    test('with a different web resource containing different location header', async () => {
        const mock = new NetworkInterception('**/foobar/**')
        mock.respond('http://json.org/image.svg')
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            requestId: 123,
            request: { url: 'http://test.com/foobar/test.html' },
            responseHeaders: [
                { name: 'Location', value: 'http://some.other/picture.png' },
                { name: 'Content-Type', value: 'application/json' }
            ]
        })

        expect(cdpClient.send.mock.calls.pop()[1].responseHeaders).toMatchSnapshot()
    })

    test('with modified headers', async () => {
        const mock = new NetworkInterception('**/foobar/**')
        mock.respond((r) => r.body, { headers: {
            removed: undefined,
            added: 'string'
        } })
        const responseHeaders = [{ name: 'Content-Type', value: 'application/json' }]
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            requestId: 123,
            request: { url: 'http://test.com/foobar/test.html' },
            responseHeaders
        })

        expect(cdpClient.send.mock.calls.pop()).toMatchSnapshot()
    })

    test('with modified status code', async () => {
        const mock = new NetworkInterception('**/foobar/**')
        mock.respond((r) => r.body, { statusCode: 1234 })
        await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
            requestId: 123,
            request: { url: 'http://test.com/foobar/test.html' },
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }]
        })

        expect(cdpClient.send.mock.calls.pop()).toMatchSnapshot()
    })
})

test('allows to clear mocks', async () => {
    const mock = new NetworkInterception('**/foobar/**')
    await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
        request: { url: 'http://test.com/foobar/test.html' },
        responseHeaders: []
    })
    expect(mock.calls.length).toBe(1)
    mock.clear()
    expect(mock.calls.length).toBe(0)
})

test('allows to restore mocks', async () => {
    const mock = new NetworkInterception('**/foobar/**')
    mock.respondOnce({ foo: 'bar' })
    mock.respond({ bar: 'foo' })

    expect(mock.respondOverwrites.length).toBe(2)
    await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
        request: { url: 'http://test.com/foobar/test.html' },
        responseHeaders: []
    })
    expect(mock.respondOverwrites.length).toBe(1)
    await NetworkInterception.handleRequestInterception(cdpClient, [mock])({
        request: { url: 'http://test.com/foobar/test.html' },
        responseHeaders: []
    })
    expect(mock.respondOverwrites.length).toBe(1)

    mock.restore()
    expect(mock.respondOverwrites.length).toBe(0)
})
