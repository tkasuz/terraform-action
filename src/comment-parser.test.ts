/**
 * Unit tests for PR comment parsing logic
 */

import { parseComment, validateProjectNames, getTargetProjects } from './comment-parser';

describe('comment-parser', () => {
  describe('parseComment', () => {
    it('should parse basic plan command', () => {
      const result = parseComment('terraform plan');

      expect(result).toEqual({
        command: 'plan',
        projects: [],
        args: [],
      });
    });

    it('should parse basic apply command', () => {
      const result = parseComment('terraform apply');

      expect(result).toEqual({
        command: 'apply',
        projects: [],
        args: [],
      });
    });

    it('should parse command with single project', () => {
      const result = parseComment('terraform plan -project=production');

      expect(result).toEqual({
        command: 'plan',
        projects: ['production'],
        args: [],
      });
    });

    it('should parse command with multiple projects', () => {
      const result = parseComment('terraform apply -project=production,staging');

      expect(result).toEqual({
        command: 'apply',
        projects: ['production', 'staging'],
        args: [],
      });
    });

    it('should parse command with multiple projects without spaces', () => {
      const result = parseComment('terraform plan -project=production,staging,development');

      expect(result).toEqual({
        command: 'plan',
        projects: ['production', 'staging', 'development'],
        args: [],
      });
    });

    it('should parse command with target argument', () => {
      const result = parseComment('terraform plan -target=aws_instance.example');

      expect(result).toEqual({
        command: 'plan',
        projects: [],
        args: ['-target=aws_instance.example'],
      });
    });

    it('should parse command with multiple arguments', () => {
      const result = parseComment(
        'terraform plan -target=aws_instance.example -var-file=prod.tfvars'
      );

      expect(result).toEqual({
        command: 'plan',
        projects: [],
        args: ['-target=aws_instance.example', '-var-file=prod.tfvars'],
      });
    });

    it('should parse command with project and arguments', () => {
      const result = parseComment(
        'terraform plan -project=staging -target=aws_instance.example'
      );

      expect(result).toEqual({
        command: 'plan',
        projects: ['staging'],
        args: ['-target=aws_instance.example'],
      });
    });

    it('should parse command with multiple projects and arguments', () => {
      const result = parseComment(
        'terraform apply -project=production,staging -var-file=prod.tfvars -target=aws_instance.web'
      );

      expect(result).toEqual({
        command: 'apply',
        projects: ['production', 'staging'],
        args: ['-var-file=prod.tfvars', '-target=aws_instance.web'],
      });
    });

    it('should handle quoted arguments', () => {
      const result = parseComment('terraform plan -var="foo=bar baz"');

      expect(result).toEqual({
        command: 'plan',
        projects: [],
        args: ['-var=foo=bar baz'],
      });
    });

    it('should handle single quoted arguments', () => {
      const result = parseComment("terraform plan -var='foo=bar baz'");

      expect(result).toEqual({
        command: 'plan',
        projects: [],
        args: ['-var=foo=bar baz'],
      });
    });

    it('should handle multiple quoted arguments', () => {
      const result = parseComment('terraform plan -var="foo=bar" -var="baz=qux"');

      expect(result).toEqual({
        command: 'plan',
        projects: [],
        args: ['-var=foo=bar', '-var=baz=qux'],
      });
    });

    it('should trim whitespace from comment', () => {
      const result = parseComment('  terraform plan  ');

      expect(result).toEqual({
        command: 'plan',
        projects: [],
        args: [],
      });
    });

    it('should return null for empty comment', () => {
      expect(parseComment('')).toBeNull();
    });

    it('should handle complex real-world examples', () => {
      const result = parseComment(
        'terraform plan -project=prod-us-east,prod-us-west -target=module.vpc -var-file=production.tfvars'
      );

      expect(result).toEqual({
        command: 'plan',
        projects: ['prod-us-east', 'prod-us-west'],
        args: ['-target=module.vpc', '-var-file=production.tfvars'],
      });
    });

    it('should handle empty project list in -project flag', () => {
      const result = parseComment('terraform plan -project=');

      expect(result).toEqual({
        command: 'plan',
        projects: [],
        args: [],
      });
    });

    it('should filter out empty project names from comma-separated list', () => {
      const result = parseComment('terraform plan -project=prod,,staging,');

      expect(result).toEqual({
        command: 'plan',
        projects: ['prod', 'staging'],
        args: [],
      });
    });
  });

  describe('validateProjectNames', () => {
    it('should not throw when all requested projects exist', () => {
      const requestedProjects = ['production', 'staging'];
      const configuredProjects = ['production', 'staging', 'development'];

      expect(() => {
        validateProjectNames(requestedProjects, configuredProjects);
      }).not.toThrow();
    });

    it('should not throw when requested projects is empty', () => {
      const requestedProjects: string[] = [];
      const configuredProjects = ['production', 'staging'];

      expect(() => {
        validateProjectNames(requestedProjects, configuredProjects);
      }).not.toThrow();
    });

    it('should throw when requested project does not exist', () => {
      const requestedProjects = ['nonexistent'];
      const configuredProjects = ['production', 'staging'];

      expect(() => {
        validateProjectNames(requestedProjects, configuredProjects);
      }).toThrow("Project 'nonexistent' not found in configuration");
      expect(() => {
        validateProjectNames(requestedProjects, configuredProjects);
      }).toThrow('Available projects: production, staging');
    });

    it('should throw when one of multiple requested projects does not exist', () => {
      const requestedProjects = ['production', 'invalid', 'staging'];
      const configuredProjects = ['production', 'staging'];

      expect(() => {
        validateProjectNames(requestedProjects, configuredProjects);
      }).toThrow("Project 'invalid' not found in configuration");
    });

    it('should work with single project', () => {
      const requestedProjects = ['production'];
      const configuredProjects = ['production'];

      expect(() => {
        validateProjectNames(requestedProjects, configuredProjects);
      }).not.toThrow();
    });
  });

  describe('getTargetProjects', () => {
    it('should return requested projects when specified', () => {
      const parsedComment = {
        command: 'plan' as const,
        projects: ['production', 'staging'],
        args: [],
      };
      const allProjects = ['production', 'staging', 'development'];

      const result = getTargetProjects(parsedComment, allProjects);

      expect(result).toEqual(['production', 'staging']);
    });

    it('should return all projects when none specified', () => {
      const parsedComment = {
        command: 'plan' as const,
        projects: [],
        args: [],
      };
      const allProjects = ['production', 'staging', 'development'];

      const result = getTargetProjects(parsedComment, allProjects);

      expect(result).toEqual(['production', 'staging', 'development']);
    });

    it('should validate requested projects exist', () => {
      const parsedComment = {
        command: 'plan' as const,
        projects: ['nonexistent'],
        args: [],
      };
      const allProjects = ['production', 'staging'];

      expect(() => {
        getTargetProjects(parsedComment, allProjects);
      }).toThrow("Project 'nonexistent' not found in configuration");
    });

    it('should handle single project request', () => {
      const parsedComment = {
        command: 'apply' as const,
        projects: ['production'],
        args: [],
      };
      const allProjects = ['production', 'staging', 'development'];

      const result = getTargetProjects(parsedComment, allProjects);

      expect(result).toEqual(['production']);
    });

    it('should preserve project order from comment', () => {
      const parsedComment = {
        command: 'plan' as const,
        projects: ['staging', 'production'],
        args: [],
      };
      const allProjects = ['production', 'staging', 'development'];

      const result = getTargetProjects(parsedComment, allProjects);

      expect(result).toEqual(['staging', 'production']);
    });
  });
});
