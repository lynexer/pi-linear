import { LinearClient, LinearGraphQLClient, type LinearRawResponse } from '@linear/sdk';

let instance: LinearService | null = null;

export class LinearService {
    private _client: LinearClient | null = null;
    private _graphQLClient: LinearGraphQLClient | null = null;
    private _apiKey: string;

    private constructor() {
        const apiKey = process.env.LINEAR_API_KEY;
        if (!apiKey) {
            throw new Error(
                'LINEAR_API_KEY environment variable is not set. ' +
                    'Get one from Linear Settings → API → Personal API Keys.'
            );
        }
        this._apiKey = apiKey;
    }

    static getInstance(): LinearService {
        if (!instance) {
            instance = new LinearService();
        }
        return instance;
    }

    get sdk(): LinearClient {
        if (!this._client) {
            this._client = new LinearClient({ apiKey: this._apiKey });
        }
        return this._client;
    }

    get graphQLClient(): LinearGraphQLClient {
        if (!this._graphQLClient) {
            this._graphQLClient = new LinearGraphQLClient('https://api.linear.app/graphql', {
                headers: {
                    Authorization: this._apiKey
                }
            });
        }
        return this._graphQLClient;
    }

    async rawRequest<Data, Variables extends Record<string, unknown>>(
        query: string,
        variables?: Variables
    ): Promise<LinearRawResponse<Data>> {
        return this.graphQLClient.rawRequest<Data, Variables>(query, variables);
    }
}
