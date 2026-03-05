import { describe } from 'vitest';

import { F, js, test, ts } from '../-utils/test.ts';

describe('named-only decorator imports with importSubstitutes base class', function () {
  test('model with named-only decorator imports and importSubstitutes base class produces fields', {
    config: {
      emberDataImportSource: '@custom/decorators/model',
      importSubstitutes: [
        {
          import: '@custom/core/-base-model',
          trait: 'base-model-trait',
          extension: 'base-model-extension',
        },
      ],
    },
    input: {
      [F.tsmodel('approval-request')]: ts`
        import BaseModel from '@custom/core/-base-model';
        import { attr, belongsTo } from '@custom/decorators/model';
        import BaseModelMixin from '../mixins/base-model';

        export default class ApprovalRequest extends BaseModel.extend(BaseModelMixin) {
          @attr('string') declare name: string;
          @attr('number') declare status: number;
          @belongsTo('user', { async: false, inverse: null }) declare createdBy: unknown;
        }
      `,
      [F.jsmixin('base-model')]: js`
        import Mixin from '@ember/object/mixin';

        export default Mixin.create({});
      `,
    },
    output: {
      [F.resource('approval-request')]: ts`
        import type { LegacyResourceSchema } from '@warp-drive/core-types/schema/fields';

        const ApprovalRequestSchema = {
          type: 'approval-request',
          legacy: true,
          identity: {
            kind: '@id',
            name: 'id',
          },
          fields: [
            {
              kind: 'attribute',
              name: 'name',
              type: 'string',
            },
            {
              kind: 'attribute',
              name: 'status',
              type: 'number',
            },
            {
              kind: 'belongsTo',
              name: 'createdBy',
              type: 'user',
              options: {
                async: false,
                inverse: null,
              },
            },
          ],
          traits: ['base-model', 'base-model-trait'],
          objectExtensions: ['base-model-extension'],
        } satisfies LegacyResourceSchema;

        export default ApprovalRequestSchema;
      `,
      [F.resourceType('approval-request')]: ts`
        import type { Type } from '@warp-drive/core-types/symbols';
        import type { WithLegacy } from '@ember-data/model/migration-support';
        import type { User } from './user.type.ts';

        /**
         * This type represents the full set schema derived fields of
         * the 'approval-request' resource, without any of the legacy mode features
         * and without any extensions.
         *
         * > [!TIP]
         * > It is likely that you will want a more specific type tailored
         * > to the context of where some data has been loaded, for instance
         * > one that marks specific fields as readonly, or which only enables
         * > some fields to be null during create, or which only includes
         * > a subset of fields based on a specific API response.
         * >
         * > For those cases, you can create a more specific type that derives
         * > from this type to ensure that your type definitions stay consistent
         * > with the schema. For more details read about {@link https://warp-drive.io/api/@warp-drive/core/types/record/type-aliases/Mask | Masking}
         *
         * See also {@link ApprovalRequest} for fields + legacy mode features
         */
        export interface ApprovalRequestResource
          extends BaseModelTrait,
            BaseModelTraitTrait {
          readonly [Type]: 'approval-request';
          id: string | null;
          name: string;
          status: number;
          createdBy: unknown;
        }

        /**
         * This type represents the full set schema derived fields of
         * the 'approval-request' resource, including all legacy mode features but
         * without any extensions.
         *
         * See also {@link ApprovalRequestResource} for fields + legacy mode features
         */
        export interface ApprovalRequest
          extends WithLegacy<ApprovalRequestResource> {}
      `,
      [F.resource('base-model')]: ts`
        import type { LegacyResourceSchema } from '@warp-drive/core-types/schema/fields';

        const BaseModelTraitSchema = {
          name: 'base-model',
          mode: 'legacy',
          fields: [],
        } satisfies LegacyResourceSchema;

        export default BaseModelTraitSchema;

        /**
         * This type represents the full set schema derived fields of
         * the 'base-model' trait, without any of the legacy mode features
         * and without any extensions.
         *
         * > [!TIP]
         * > It is likely that you will want a more specific type tailored
         * > to the context of where some data has been loaded, for instance
         * > one that marks specific fields as readonly, or which only enables
         * > some fields to be null during create, or which only includes
         * > a subset of fields based on a specific API response.
         * >
         * > For those cases, you can create a more specific type that derives
         * > from this type to ensure that your type definitions stay consistent
         * > with the schema. For more details read about {@link https://warp-drive.io/api/@warp-drive/core/types/record/type-aliases/Mask | Masking}
         *
         * See also {@link BaseModel} for fields + legacy mode features
         */
        export interface BaseModelTrait {}

        /**
         * This type represents the full set schema derived fields of
         * the 'base-model' trait, including all legacy mode features but
         * without any extensions.
         *
         * See also {@link BaseModelTrait} for fields + legacy mode features
         */
        export interface BaseModel extends WithLegacy<BaseModelTrait> {}
      `,
    },
  });
});
