const path = require('path')

module.exports = (_env, argv = {}) => {
    const mode = argv.mode === 'production' ? 'production' : 'development'
    const isProduction = mode === 'production'

    return {
        target: 'node',
        entry: 'src/index.ts',
        devtool: 'source-map',
        context: __dirname,
        mode,
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'index.js',
            pathinfo: !isProduction,
            libraryTarget: 'umd',
            devtoolModuleFilenameTemplate: 'webpack-tabby-mingze-tearoff:///[resource-path]',
        },
        resolve: {
            modules: ['.', 'src', 'node_modules'].map(x => path.join(__dirname, x)),
            extensions: ['.ts', '.js'],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    loader: 'ts-loader',
                    options: {
                        configFile: path.resolve(__dirname, 'tsconfig.json'),
                    },
                },
                {
                    test: /\.scss/,
                    use: ['style-loader', 'css-loader', 'sass-loader'],
                },
                { test: /\.pug$/, use: ['apply-loader', 'pug-loader'] },
            ],
        },
        externals: [
            'fs',
            'ngx-toastr',
            /^rxjs/,
            /^@angular/,
            /^@ng-bootstrap/,
            /^tabby-/,
        ],
    }
}
